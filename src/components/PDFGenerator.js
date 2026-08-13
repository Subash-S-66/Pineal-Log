import { format } from 'date-fns';

export async function generatePDF(members, entries, currentWeekStart, weekDays, trackerType = 'pineal') {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({
    orientation: 'landscape', // Better for 7 days
    unit: 'mm',
    format: 'a4'
  });

  // Colors
  const bgColor = '#060912';
  const accentColor = trackerType === 'tiger' ? '#ff1493' : '#d4a017';
  const textMuted = '#6a7f9a';
  const textPrimary = '#e0d4bc';

  // Override addPage to inject background first thing
  const originalAddPage = doc.addPage.bind(doc);
  doc.addPage = function() {
    originalAddPage(...arguments);
    const prevFillStyle = doc.getFillColor();
    doc.setFillColor(bgColor);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setFillColor(accentColor);
    doc.rect(0, 0, 297, 4, 'F');
    doc.setFillColor(prevFillStyle);
    return this;
  };

  // Fill background on first page
  doc.setFillColor(bgColor);
  doc.rect(0, 0, 297, 210, 'F');

  // Accent bar on first page
  doc.setFillColor(accentColor);
  doc.rect(0, 0, 297, 4, 'F');

  // Title
  doc.setTextColor(accentColor);
  doc.setFont('times', 'bold'); // Fallback to times since custom fonts require base64
  doc.setFontSize(28);
  doc.text(trackerType === 'tiger' ? 'TIGER LOG' : 'PINEALLOG', 14, 24);

  // Subtitle
  doc.setTextColor(textMuted);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('HOS Alliance · Server 1895', 14, 32);

  // Date Range
  doc.setTextColor(textPrimary);
  const weekEnd = weekDays[6];
  const dateStr = `Week of ${format(currentWeekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  doc.text(dateStr, 283, 24, { align: 'right' });

  // Prepare table data
  const head = [['#', 'Member', ...weekDays.map(d => format(d, 'EEE (MM/dd)')), 'Overall Total']];

  let grandTotal = 0;
  let activeMembers = 0;

  const getStaminaValue = (memberId, dateStr) => {
    const entry = entries.find(e => String(e.memberId) === String(memberId) && e.date === dateStr);
    return entry ? entry.stamina : 0;
  };

  const getMemberWeeklyTotal = (memberId) => {
    return weekDays.reduce((sum, day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return sum + getStaminaValue(memberId, dateStr);
    }, 0);
  };

  const getDayTotal = (dateStr) => {
    return entries.filter(e => e.date === dateStr).reduce((sum, e) => sum + (e.stamina || 0), 0);
  };

  const body = members.map((member, index) => {
    const overallTotal = member.overallTotal || 0;
    // We can define active members as those who have overall stamina, or active this week. Let's use overallTotal > 0.
    if (overallTotal > 0) activeMembers++;
    grandTotal += overallTotal;

    const row = [
      (index + 1).toString(),
      member.name,
      ...weekDays.map(day => {
        const val = getStaminaValue(member._id, format(day, 'yyyy-MM-dd'));
        return val > 0 ? val.toString() : '0';
      }),
      overallTotal.toString()
    ];
    return row;
  });

  const footerRow = [
    '',
    'DAILY TOTALS',
    ...weekDays.map(day => getDayTotal(format(day, 'yyyy-MM-dd')).toString()),
    grandTotal.toString()
  ];
  body.push(footerRow);

  // AutoTable
  autoTable(doc, {
    startY: 40,
    head,
    body,
    theme: 'plain',
    styles: {
      fillColor: '#0f1829',
      textColor: '#e0d4bc',
      lineColor: '#1d2d45',
      lineWidth: 0.1,
      halign: 'center',
    },
    headStyles: {
      fillColor: '#0c1221',
      textColor: accentColor,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'left', fontStyle: 'bold' },
      [weekDays.length + 2]: { textColor: accentColor, fontStyle: 'bold' } // Total column
    },
    alternateRowStyles: {
      fillColor: '#0a1020'
    },
    didParseCell: function(data) {
      // Highlight footer row
      if (data.row.index === body.length - 1) {
        data.cell.styles.textColor = accentColor;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = '#0c1221';
      }
    }
  });

  // Summary Box
  const finalY = doc.lastAutoTable.finalY || 40;

  doc.setFillColor('#0f1829');
  doc.setDrawColor(accentColor);
  doc.lineWidth = 0.5;
  doc.roundedRect(14, finalY + 10, 269, 20, 2, 2, 'FD');

  const avgPerMember = members.length > 0 ? (grandTotal / members.length).toFixed(1) : '0';
  const participation = members.length > 0 ? Math.round((activeMembers / members.length) * 100) : 0;

  doc.setTextColor('#6a7f9a');
  doc.setFontSize(10);
  doc.text('Overall Stamina', 30, finalY + 16);
  doc.text('Active Members', 100, finalY + 16);
  doc.text('Avg per Member', 170, finalY + 16);
  doc.text('Participation %', 240, finalY + 16);

  doc.setTextColor(accentColor);
  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.text(grandTotal.toString(), 30, finalY + 24);
  doc.text(`${activeMembers} / ${members.length}`, 100, finalY + 24);
  doc.text(avgPerMember.toString(), 170, finalY + 24);
  doc.text(`${participation}%`, 240, finalY + 24);

  // Footer
  doc.setTextColor('#3d5170');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const generatorName = trackerType === 'tiger' ? 'Tiger Log' : 'PinealLog';
  doc.text(`Generated by ${generatorName} · ${new Date().toLocaleString()}`, 14, 200);

  // Save
  const fileNamePrefix = trackerType === 'tiger' ? 'TigerLog' : 'PinealLog';
  doc.save(`${fileNamePrefix}-HOS-WeekOf-${format(currentWeekStart, 'yyyy-MM-dd')}.pdf`);
}
