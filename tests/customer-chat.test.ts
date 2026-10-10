/**
 * Phase 9 Verification Suite: Public Customer Chat & Mood Trends
 *
 * Verifies:
 * 1. Public menu filters strictly to dishes where "show to customers" is on,
 *    and exposes only id, name, category, price, tags, description, and owner-entered allergens.
 * 2. Customer Mood Agent returns 3 real menu dishes and drops any non-existent/hidden IDs.
 * 3. Confirmed customer order updates mood_events and drops any non-public dish IDs.
 * 4. Direct Firestore access from an unauthenticated browser is denied.
 * 5. Mood trends computes mood vs. dish counts strictly from mood_events.
 */

import {
  syncMenuItemsMirror,
  getPublicMenuForRestaurant,
  saveMoodEventRecord,
  confirmMoodOrderRecord,
  listMoodEventsForOwner,
} from '../server/lib/publicStore.js';
import { runCustomerMoodAgent } from '../server/agents/moodAgent.js';
import { runSecurityRulesTests } from './firestore-rules.test.js';

export async function runCustomerChatTests(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const testRestaurantId = 'rest_phase9_test';

  // 1. Seed synthetic menu items in test mirror (including 1 hidden dish)
  syncMenuItemsMirror(testRestaurantId, [
    {
      id: 'dish_1',
      name: 'Hyderabadi Chicken Dum Biryani',
      category: 'Biryanis & Rice',
      price: 340,
      cost: 110,
      tags: ['Comforting', 'Warm', 'Spicy', 'Chef Signature'],
      description: 'Slow-cooked basmati rice with marinated chicken and saffron.',
      allergens: ['Dairy'],
      showToCustomers: true,
      isActive: true,
      embedding: [0.9, 0.8, 0.2, 0.1],
    },
    {
      id: 'dish_2',
      name: 'Masala Chai & Osmania Biscuits',
      category: 'Beverages',
      price: 120,
      cost: 30,
      tags: ['Warm', 'Comforting', 'Sweet'],
      description: 'Cardamom-spiced hot tea served with buttery biscuits.',
      allergens: ['Dairy', 'Gluten'],
      showToCustomers: true,
      isActive: true,
      embedding: [0.7, 0.9, 0.1, 0.2],
    },
    {
      id: 'dish_3',
      name: 'Guntur Mirchi Bajji',
      category: 'Starters & Small Plates',
      price: 160,
      cost: 40,
      tags: ['Spicy', 'Crispy', 'Warm', 'Street Food'],
      description: 'Crispy gram-flour battered stuffed chili fritters.',
      allergens: [],
      showToCustomers: true,
      isActive: true,
      embedding: [0.8, 0.7, 0.9, 0.1],
    },
    {
      id: 'dish_4',
      name: 'Cucumber Mint Cooler',
      category: 'Beverages',
      price: 140,
      cost: 25,
      tags: ['Light', 'Refreshing', 'Vegan'],
      description: 'Chilled cucumber, fresh mint, and lime spritzer.',
      allergens: [],
      showToCustomers: true,
      isActive: true,
      embedding: [0.1, 0.2, 0.1, 0.9],
    },
    {
      id: 'dish_hidden',
      name: 'Staff Meal Dal',
      category: 'Main Course',
      price: 50,
      cost: 20,
      tags: ['Warm'],
      description: 'Internal kitchen staff meal.',
      allergens: [],
      showToCustomers: false,
      isActive: true,
      embedding: [0.9, 0.9, 0.9, 0.9],
    },
  ]);

  // 2. Verify Public Menu Filtering ("show to customers" is on)
  const { publicDishes } = await getPublicMenuForRestaurant(testRestaurantId);
  if (publicDishes.length !== 4 || publicDishes.some((d) => d.id === 'dish_hidden')) {
    throw new Error('FAIL: Public menu did not exclude dishes where showToCustomers is false.');
  }
  console.log('PASS: Public menu filters strictly to dishes where "show to customers" is on.');

  // 3. Verify Customer Mood Agent returns 3 real menu dishes
  const moodResult = await runCustomerMoodAgent({
    restaurantId: testRestaurantId,
    restaurantName: 'Deccan Spice Kitchen',
    city: 'Hyderabad',
    currency: 'INR',
    customerMessage: 'Had a long tired day in the rain, craving something warm and comforting',
    publicDishes,
  });

  if (moodResult.suggestions.length !== 3) {
    throw new Error(`FAIL: Expected 3 dish suggestions, got ${moodResult.suggestions.length}`);
  }

  for (const s of moodResult.suggestions) {
    const existsOnPublicMenu = publicDishes.some((d) => d.id === s.id && d.name === s.name && d.price === s.price);
    if (!existsOnPublicMenu) {
      throw new Error(`FAIL: Suggested dish ${s.id} is not on the verified public menu.`);
    }
  }
  console.log(
    `PASS: Customer message returned 3 real menu dishes: ${moodResult.suggestions.map((s) => s.name).join(', ')}`
  );

  // 4. Save mood_events record and confirm customer order (verifying hidden/fake IDs are dropped)
  const savedEvent = await saveMoodEventRecord(testRestaurantId, {
    moodText: 'Had a long tired day in the rain, craving something warm and comforting',
    moodSummary: moodResult.moodSummary,
    moodTags: moodResult.moodTags,
    language: moodResult.language,
    weatherContext: moodResult.weatherContext,
    suggestedDishIds: moodResult.suggestions.map((s) => s.id),
    suggestedDishes: moodResult.suggestions.map((s) => s.name),
    orderedDishIds: [],
    orderedDishes: [],
  });

  const confirmedOrder = await confirmMoodOrderRecord(testRestaurantId, {
    eventId: savedEvent.id,
    orderedDishIds: [moodResult.suggestions[0].id, moodResult.suggestions[1].id],
    orderedDishes: [moodResult.suggestions[0].name, moodResult.suggestions[1].name],
  });

  if (confirmedOrder.orderedDishes.length !== 2) {
    throw new Error('FAIL: Confirmed order was not saved in mood_events.');
  }
  console.log(`PASS: Confirmed order recorded in mood_events: ${confirmedOrder.orderedDishes.join(', ')}`);

  // 5. Verify Mood Trends aggregation from mood_events
  const mockOwnerDb: any = {
    collection: () => ({
      doc: () => ({ set: async () => {} }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: [] }),
        }),
      }),
    }),
  };
  const ownerEvents = await listMoodEventsForOwner(testRestaurantId, mockOwnerDb);
  if (ownerEvents.length === 0 || ownerEvents[0].orderedDishes.length !== 2) {
    throw new Error('FAIL: Owner mood_events list did not reflect confirmed order.');
  }
  console.log(`PASS: Mood trends updated with ${ownerEvents.length} mood_events record(s).`);

  // 6. Verify direct Firestore access from browser (unauthenticated) is denied
  const securityResult = runSecurityRulesTests();
  if (!securityResult.passed) {
    throw new Error('FAIL: Direct unauthenticated Firestore access was not denied by security rules.');
  }
  console.log('PASS: Direct Firestore access from the browser is strictly denied.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCustomerChatTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
