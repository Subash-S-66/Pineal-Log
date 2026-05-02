export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';



export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('pineallog');

    // Fetch entries between startDate and endDate inclusive
    const entries = await db.collection('entries').find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).toArray();

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Failed to fetch entries', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { memberId, memberName, date, stamina } = body;

    if (!memberId || !memberName || !date || typeof stamina !== 'number' || stamina < 0) {
      return NextResponse.json({ error: 'Invalid input data' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('pineallog');
    const collection = db.collection('entries');

    const filter = { memberId, date };
    const update = {
      $set: {
        memberId,
        memberName,
        date,
        stamina,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    };

    const result = await collection.findOneAndUpdate(filter, update, {
      upsert: true,
      returnDocument: 'after'
    });

    return NextResponse.json(result.value || result);
  } catch (error) {
    console.error('Failed to save entry', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
