'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks, isSameDay, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Download, Trash2, Check, Loader2, Search } from 'lucide-react';
import AddMemberModal from './AddMemberModal';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [members, setMembers] = useState([]);
  const [entries, setEntries] = useState([]); // Array of all entries for the week
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStarts: 1 }));
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingCells, setSavingCells] = useState({}); // `${memberId}-${date}` -> bool
  const [savedCells, setSavedCells] = useState({}); // `${memberId}-${date}` -> bool
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const weekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStarts: 1 }), [currentWeekStart]);
  const isCurrentWeek = isSameDay(startOfWeek(new Date(), { weekStarts: 1 }), currentWeekStart) || currentWeekStart > new Date();
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Convert dates to stable primitive strings for the dependency array to prevent infinite fetch loops
  const currentWeekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch members
        const membersRes = await fetch('/api/members');
        const membersData = await membersRes.json();

        if (Array.isArray(membersData)) {
          setMembers(membersData);
        } else {
          throw new Error('Invalid members format');
        }

        // Fetch entries for the week
        const entriesRes = await fetch(`/api/entries?startDate=${currentWeekStartStr}&endDate=${weekEndStr}`);
        const entriesData = await entriesRes.json();

        if (Array.isArray(entriesData)) {
          setEntries(entriesData);
        } else {
          setEntries([]);
          throw new Error('Invalid entries format or API error');
        }
      } catch (error) {
        console.error('Failed to fetch data', error);
        showToast('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentWeekStartStr, weekEndStr]);

  const handleAddMember = (newMember) => {
    setMembers((prev) => [...prev, newMember]);
  };

  const handleDeleteMember = async (id, name) => {
    if (!confirm(`Remove ${name} from roster? This will delete all their entries.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete member');

      setMembers((prev) => prev.filter((m) => m._id !== id));
      setEntries((prev) => prev.filter((e) => e.memberId !== id));
    } catch (error) {
      console.error(error);
      showToast('Failed to delete member');
    }
  };

  const handleStaminaChange = async (memberId, memberName, dateStr, valueStr) => {
    let stamina = parseInt(valueStr, 10);
    if (isNaN(stamina) || stamina < 0) stamina = 0; // Or treat empty as 0

    const cellKey = `${memberId}-${dateStr}`;
    setSavingCells((prev) => ({ ...prev, [cellKey]: true }));

    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          memberName,
          date: dateStr,
          stamina
        })
      });

      if (!res.ok) throw new Error('Failed to save entry');

      const savedEntry = await res.json();

      // Calculate difference to update overall total locally
      const prevEntry = entries.find(e => String(e.memberId) === String(memberId) && e.date === dateStr);
      const prevStamina = prevEntry ? prevEntry.stamina : 0;
      const staminaDiff = stamina - prevStamina;

      // Update local state for entries
      setEntries((prev) => {
        const filtered = prev.filter(e => !(e.memberId === memberId && e.date === dateStr));
        return [...filtered, savedEntry];
      });

      // Update local state for members overallTotal
      if (staminaDiff !== 0) {
        setMembers((prev) => prev.map(m => {
          if (m._id === memberId) {
            return { ...m, overallTotal: (m.overallTotal || 0) + staminaDiff };
          }
          return m;
        }));
      }

      // Show checkmark briefly
      setSavedCells((prev) => ({ ...prev, [cellKey]: true }));
      setTimeout(() => {
        setSavedCells((prev) => ({ ...prev, [cellKey]: false }));
      }, 2000);

    } catch (error) {
      console.error(error);
      showToast('Failed to save stamina entry');
    } finally {
      setSavingCells((prev) => ({ ...prev, [cellKey]: false }));
    }
  };

  const handleDownloadPdf = async () => {
    if (!window.confirm("Are you sure you want to download the PDF report?")) {
      return;
    }
    setGeneratingPdf(true);
    try {
      const { generatePDF } = await import('./PDFGenerator');
      generatePDF(members, entries, currentWeekStart, weekDays);
    } catch (error) {
      console.error(error);
      showToast('Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const getStaminaValue = (memberId, dateStr) => {
    const entry = entries.find(e => String(e.memberId) === String(memberId) && e.date === dateStr);
    return entry ? entry.stamina : '';
  };

  const getMemberWeeklyTotal = (memberId) => {
    return weekDays.reduce((sum, day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries.find(e => String(e.memberId) === String(memberId) && e.date === dateStr);
      return sum + (entry?.stamina || 0);
    }, 0);
  };

  const getDayTotal = (dateStr) => {
    return entries.filter(e => e.date === dateStr).reduce((sum, e) => sum + (e.stamina || 0), 0);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const dailyStaminaToday = getDayTotal(todayStr);
  const contributorsToday = entries.filter(e => e.date === todayStr && (e.stamina || 0) > 0).length;

  const grandTotal = members.reduce((sum, m) => sum + (m.overallTotal || 0), 0);
  const activeMembersThisWeek = members.filter(m => (m.overallTotal || 0) > 0).length;
  const avgPerMember = members.length > 0 ? (grandTotal / members.length).toFixed(1) : 0;

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading && members.length === 0) {
    return <div className={styles.loadingContainer}><Loader2 className={styles.spinner} size={48} /></div>;
  }

  return (
    <div className={styles.container}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.logoContainer}>
          <h1 className={styles.logo}>PinealLog</h1>
          <p className={styles.subtitle}>HOS Alliance · Server 1895</p>
        </div>
      </header>

      {/* TOP TOTALS BAR */}
      <div className={styles.topTotalsBar}>
        <div className={styles.totalItem}>
          <span>Daily Stamina</span>
          <strong>{dailyStaminaToday}</strong>
        </div>
        <div className={styles.totalItem}>
          <span>Contributors Today</span>
          <strong>{contributorsToday} / {members.length}</strong>
        </div>
        <div className={styles.totalItem}>
          <span>Avg per Member</span>
          <strong>{avgPerMember}</strong>
        </div>
      </div>

      {/* DATE NAVIGATOR */}
      <div className={styles.dateNavigator}>
        <button onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))} className={styles.navBtn} disabled={loading || generatingPdf || Object.keys(savingCells).some(k => savingCells[k])}>
          <ChevronLeft /> Prev Week
        </button>
        <h2 className={styles.currentDateRange}>
          {format(currentWeekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <button
          onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
          className={styles.navBtn}
          disabled={isCurrentWeek || loading || generatingPdf || Object.keys(savingCells).some(k => savingCells[k])}
        >
          Next Week <ChevronRight />
        </button>
      </div>

      {/* ACTION BAR & SEARCH */}
      <div className={styles.actionBar}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search member..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.actionButtons}>
          <button onClick={() => setShowAddModal(true)} className={styles.btnPrimary} disabled={loading || generatingPdf || Object.keys(savingCells).some(k => savingCells[k])}>
            <Plus size={18} /> Add Member
          </button>
          <button
            onClick={handleDownloadPdf}
            className={styles.btnSecondary}
            disabled={generatingPdf || members.length === 0 || loading || Object.keys(savingCells).some(k => savingCells[k])}
          >
            {generatingPdf ? <Loader2 size={18} className={styles.spinner} /> : <Download size={18} />}
            Download PDF Report
          </button>
        </div>
      </div>

      {/* STAMINA TABLE */}
      {members.length === 0 ? (
        <div className={styles.emptyState}>No members found. Add one to get started.</div>
      ) : filteredMembers.length === 0 ? (
        <div className={styles.emptyState}>No members found matching &quot;{searchQuery}&quot;.</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Member</th>
                {weekDays.map(day => (
                  <th key={day.toISOString()} className={isSameDay(day, new Date()) ? styles.todayCol : ''}>
                    {format(day, 'EEE')} <br/> <span className={styles.dateSub}>{format(day, 'MM/dd')}</span>
                  </th>
                ))}
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member, index) => {
                const overallTotal = member.overallTotal || 0;
                return (
                  <tr key={member._id}>
                    <td>{index + 1}</td>
                    <td className={styles.memberName}>{member.name}</td>
                    {weekDays.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const val = getStaminaValue(member._id, dateStr);
                      const cellKey = `${member._id}-${dateStr}`;
                      const isSaving = savingCells[cellKey];
                      const isSaved = savedCells[cellKey];

                      return (
                        <td key={dateStr} className={styles.inputCell}>
                          <div className={styles.inputWrapper}>
                            <input
                              type="number"
                              min="0"
                              defaultValue={val}
                              disabled={isSaving}
                              onBlur={(e) => {
                                if (e.target.value !== String(val) && !(e.target.value === '' && val === '')) {
                                  handleStaminaChange(member._id, member.name, dateStr, e.target.value);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                }
                              }}
                              className={`${styles.staminaInput} ${val > 0 ? styles.hasValue : ''}`}
                              placeholder="—"
                            />
                            {isSaving && <Loader2 size={14} className={`${styles.statusIcon} ${styles.spinner}`} />}
                            {isSaved && <Check size={14} className={`${styles.statusIcon} ${styles.checkIcon}`} />}
                          </div>
                        </td>
                      );
                    })}
                    <td className={styles.totalCell}>{overallTotal > 0 ? overallTotal : '—'}</td>
                    <td>
                      <button onClick={() => handleDeleteMember(member._id, member.name)} className={styles.deleteBtn} disabled={loading || generatingPdf || Object.keys(savingCells).some(k => savingCells[k])}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2" className={styles.footerLabel}>Daily Totals</td>
                {weekDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayTotal = getDayTotal(dateStr);
                  return <td key={dateStr}>{dayTotal > 0 ? dayTotal : '—'}</td>;
                })}
                <td className={styles.grandTotalCell}>{grandTotal}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MOBILE CARDS */}
      <div className={styles.mobileCards}>
        {filteredMembers.map(member => {
          const overallTotal = member.overallTotal || 0;
          return (
            <div key={member._id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardName}>{member.name}</h3>
                <div className={styles.cardActions}>
                  <span className={styles.cardTotal}>Total: {overallTotal}</span>
                  <button onClick={() => handleDeleteMember(member._id, member.name)} className={styles.deleteBtn} disabled={loading || generatingPdf || Object.keys(savingCells).some(k => savingCells[k])}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className={styles.cardGrid}>
                {weekDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const val = getStaminaValue(member._id, dateStr);
                  const cellKey = `${member._id}-${dateStr}`;
                  const isSaving = savingCells[cellKey];
                  const isSaved = savedCells[cellKey];

                  return (
                    <div key={dateStr} className={styles.cardGridItem}>
                      <span className={styles.cardDayLabel}>{format(day, 'EEE')}</span>
                      <div className={styles.inputWrapper}>
                        <input
                          type="number"
                          min="0"
                          defaultValue={val}
                          disabled={isSaving}
                          onBlur={(e) => {
                            if (e.target.value !== String(val) && !(e.target.value === '' && val === '')) {
                              handleStaminaChange(member._id, member.name, dateStr, e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                          }}
                          className={`${styles.staminaInput} ${val > 0 ? styles.hasValue : ''}`}
                          placeholder="—"
                        />
                        {isSaving && <Loader2 size={12} className={`${styles.statusIcon} ${styles.spinner}`} />}
                        {isSaved && <Check size={12} className={`${styles.statusIcon} ${styles.checkIcon}`} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* BOTTOM TOTALS BAR */}
      <div className={styles.totalsBar}>
        <div className={styles.totalItem}>
          <span>Daily Stamina</span>
          <strong>{dailyStaminaToday}</strong>
        </div>
        <div className={styles.totalItem}>
          <span>Overall Stamina</span>
          <strong>{grandTotal}</strong>
        </div>
        <div className={styles.totalItem}>
          <span>Contributors Today</span>
          <strong>{contributorsToday} / {members.length}</strong>
        </div>
        <div className={styles.totalItem}>
          <span>Avg per Member</span>
          <strong>{avgPerMember}</strong>
        </div>
      </div>

      {showAddModal && (
        <AddMemberModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddMember}
        />
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className={styles.toast}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
