export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

const DEFAULT_MEMBERS = [
  'Kievch', 'Red', 'Lew', 'Daud', 'Tiger', 'Prince', 'Sun', 'Crip',
  'Jefe', 'Gator', 'MTN', 'Kay', 'Sophia', 'Yogi', 'Kitt', 'Lucky',
  'Sisi', 'TR', 'Omar', 'Kwad', 'Slimy', 'Sant'
];



export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tracker = searchParams.get('tracker') || 'pineal';
    let entriesCollection = 'entries';
    if (tracker === 'tiger') entriesCollection = 'entries_tiger';
    if (tracker === 'lucky') entriesCollection = 'entries_lucky';

    const client = await clientPromise;
    const db = client.db('pineallog');
    const collection = db.collection('members');

    // Use aggregation to get total stamina per member
    let members = await collection.aggregate([
      {
        $addFields: {
          idString: { $toString: "$_id" }
        }
      },
      {
        $lookup: {
          from: entriesCollection,
          let: { idStr: "$idString", idObj: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$memberId", "$$idStr"] },
                    { $eq: ["$memberId", "$$idObj"] }
                  ]
                }
              }
            }
          ],
          as: 'memberEntries'
        }
      },
      {
        $addFields: {
          overallTotal: {
            $sum: "$memberEntries.stamina"
          }
        }
      },
      {
        $project: {
          memberEntries: 0
        }
      },
      {
        $sort: { sortOrder: 1 }
      }
    ]).toArray();

    // Auto-seed if 0 members exist
    if (members.length === 0) {
      const docs = DEFAULT_MEMBERS.map((name, index) => ({
        name,
        sortOrder: index + 1,
        createdAt: new Date()
      }));

      await collection.insertMany(docs);
      members = await collection.aggregate([
        {
          $addFields: {
            idString: { $toString: "$_id" }
          }
        },
        {
          $lookup: {
            from: entriesCollection,
            let: { idStr: "$idString", idObj: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ["$memberId", "$$idStr"] },
                      { $eq: ["$memberId", "$$idObj"] }
                    ]
                  }
                }
              }
            ],
            as: 'memberEntries'
          }
        },
        {
          $addFields: {
            overallTotal: {
              $sum: "$memberEntries.stamina"
            }
          }
        },
        {
          $project: {
            memberEntries: 0
          }
        },
        {
          $sort: { sortOrder: 1 }
        }
      ]).toArray();
    }

    return NextResponse.json(members);
  } catch (error) {
    console.error('Failed to fetch members', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    const client = await clientPromise;
    const db = client.db('pineallog');
    const collection = db.collection('members');

    // Case-insensitive duplicate check
    const existingMember = await collection.findOne({ name: { $regex: new RegExp(`^${trimmedName}$`, 'i') } });
    if (existingMember) {
      return NextResponse.json({ error: 'Member already exists' }, { status: 400 });
    }

    // Get max sortOrder
    const maxSortOrderMember = await collection.find({}).sort({ sortOrder: -1 }).limit(1).toArray();
    const nextSortOrder = maxSortOrderMember.length > 0 ? maxSortOrderMember[0].sortOrder + 1 : 1;

    const newMember = {
      name: trimmedName,
      sortOrder: nextSortOrder,
      createdAt: new Date()
    };

    const result = await collection.insertOne(newMember);

    return NextResponse.json({ _id: result.insertedId, ...newMember }, { status: 201 });
  } catch (error) {
    console.error('Failed to add member', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
