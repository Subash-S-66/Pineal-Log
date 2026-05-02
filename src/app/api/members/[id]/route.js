export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';

export async function DELETE(request, { params }) {
  try {
    const id = params.id;

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('pineallog');

    // Delete member
    const deleteMemberResult = await db.collection('members').deleteOne({ _id: new ObjectId(id) });

    if (deleteMemberResult.deletedCount === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Delete associated entries
    await db.collection('entries').deleteMany({ memberId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete member', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
