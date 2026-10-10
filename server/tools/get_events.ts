import { FunctionDeclaration, Type } from '@google/genai';
import type { FirestoreClient } from '../lib/firestoreRest.js';

export interface EventItem {
  id?: string;
  name: string;
  type: string;
  date: string;
  impact: 'low' | 'medium' | 'high';
  isHoliday: boolean;
  notes?: string;
}

export interface EventsToolOutput {
  targetDate: string;
  events: EventItem[];
  hasEvent: boolean;
  eventSummary: string;
}

export const getEventsToolDeclaration: FunctionDeclaration = {
  name: 'get_events',
  description: 'Fetches accepted restaurant calendar events, community gatherings, and public holidays for the planning date.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      targetDate: {
        type: Type.STRING,
        description: 'Target calendar date in YYYY-MM-DD format.',
      },
    },
    required: ['targetDate'],
  },
};

/**
 * Known recurring public holidays / festive observances
 */
const KNOWN_HOLIDAYS_MAP: Record<string, string> = {
  '01-01': "New Year's Day",
  '01-14': 'Makar Sankranti / Pongal',
  '01-26': 'Republic Day (National Holiday)',
  '03-08': 'Maha Shivratri',
  '03-25': 'Holi Festival of Colours',
  '03-29': 'Good Friday',
  '04-11': 'Eid ul-Fitr',
  '05-01': 'May Day / Labour Day',
  '08-15': 'Independence Day (National Holiday)',
  '08-26': 'Janmashtami',
  '09-07': 'Ganesh Chaturthi',
  '10-02': 'Gandhi Jayanti (National Holiday)',
  '10-12': 'Dussehra / Vijayadashami',
  '10-31': 'Diwali / Deepavali (Festival of Lights)',
  '11-01': 'Kannada Rajyotsava / State Day',
  '12-25': 'Christmas Day',
  '12-31': "New Year's Eve Celebration",
};

/**
 * Retrieves confirmed events and public holidays for the target planning date.
 */
export async function executeGetEvents(
  restaurantId: string,
  targetDate: string,
  db?: FirestoreClient
): Promise<EventsToolOutput> {
  const events: EventItem[] = [];

  // 1. Check known public holidays
  const mmDd = targetDate.slice(5, 10);
  if (KNOWN_HOLIDAYS_MAP[mmDd]) {
    events.push({
      name: KNOWN_HOLIDAYS_MAP[mmDd],
      type: 'public_holiday',
      date: targetDate,
      impact: 'high',
      isHoliday: true,
      notes: 'Recognized public holiday; potential surge in dining and takeouts.',
    });
  }

  // 2. Fetch accepted events from Firestore
  if (db) {
    try {
      const snap = await db
        .collection(`restaurants/${restaurantId}/events`)
        .where('date', '==', targetDate)
        .limit(20)
        .get();

      for (const doc of snap.docs) {
        const d = doc.data();
        // Check if event is accepted or confirmed
        const isAccepted = d.status === undefined || d.status === 'accepted' || d.status === 'confirmed';
        if (isAccepted) {
          events.push({
            id: doc.id,
            name: d.name || d.title || 'Special Event',
            type: d.type || 'local_event',
            date: targetDate,
            impact: d.impact || 'medium',
            isHoliday: false,
            notes: d.description || d.venue || '',
          });
        }
      }
    } catch (err) {
      console.warn(`[get_events] Error fetching events from DB for ${targetDate}:`, err);
    }
  }

  const hasEvent = events.length > 0;
  const eventSummary = hasEvent
    ? events.map((e) => `${e.name} (${e.isHoliday ? 'Holiday' : e.type})`).join(', ')
    : 'No special events or public holidays scheduled.';

  return {
    targetDate,
    events,
    hasEvent,
    eventSummary,
  };
}
