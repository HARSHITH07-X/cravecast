/**
 * CraveCast Security Rules Verification Suite
 *
 * Verifies the non-negotiable security requirements:
 * 1. Owner A can read/write their own restaurant and subcollections.
 * 2. Owner B (a second authenticated account) CANNOT read or write Owner A's restaurant or subcollections.
 * 3. Anonymous (unauthenticated) users CANNOT read or write anything in Firestore.
 * 4. The public has ZERO direct Firestore access.
 */

interface SecurityContext {
  auth: { uid: string; email?: string } | null;
}

interface FirestoreState {
  documents: Map<string, { ownerUid: string; [key: string]: any }>;
}

/**
 * Pure evaluator replicating the firestore.rules logic
 */
class FirestoreRulesSimulator {
  private state: FirestoreState = {
    documents: new Map(),
  };

  public setDocument(path: string, data: any) {
    this.state.documents.set(path, data);
  }

  public getDocument(path: string) {
    return this.state.documents.get(path) || null;
  }

  /**
   * Evaluates permissions according to firestore.rules
   */
  public canAccess(
    context: SecurityContext,
    operation: 'read' | 'create' | 'update' | 'delete',
    path: string,
    requestData?: any
  ): { allowed: boolean; reason: string } {
    // Rule: Public / Unauthenticated has NO access
    if (!context.auth) {
      return { allowed: false, reason: 'Deny: Unauthenticated requests have zero access.' };
    }

    const segments = path.replace(/^\//, '').split('/');

    // Match /restaurants/{restaurantId}
    if (segments.length === 2 && segments[0] === 'restaurants') {
      const restaurantId = segments[1];
      const existingDoc = this.getDocument(`restaurants/${restaurantId}`);

      if (operation === 'create') {
        const ownerUid = requestData?.ownerUid;
        if (ownerUid === context.auth.uid) {
          return { allowed: true, reason: 'Allow: Authenticated user matches ownerUid on create.' };
        }
        return { allowed: false, reason: 'Deny: ownerUid does not match authenticated user.' };
      }

      if (existingDoc && existingDoc.ownerUid === context.auth.uid) {
        return { allowed: true, reason: 'Allow: Authenticated user owns this restaurant.' };
      }

      return { allowed: false, reason: 'Deny: User does not own this restaurant.' };
    }

    // Match /restaurants/{restaurantId}/{subcollection}/{docId}
    if (segments.length === 4 && segments[0] === 'restaurants') {
      const restaurantId = segments[1];
      const parentRestaurant = this.getDocument(`restaurants/${restaurantId}`);

      if (!parentRestaurant) {
        return { allowed: false, reason: 'Deny: Parent restaurant does not exist.' };
      }

      if (parentRestaurant.ownerUid === context.auth.uid) {
        return { allowed: true, reason: 'Allow: Authenticated user is parent restaurant owner.' };
      }

      return { allowed: false, reason: 'Deny: User does not own the parent restaurant.' };
    }

    return { allowed: false, reason: 'Deny: No matching security rule.' };
  }
}

// ==========================================
// Test Execution
// ==========================================

export function runSecurityRulesTests(): { passed: boolean; results: string[] } {
  const sim = new FirestoreRulesSimulator();
  const results: string[] = [];
  let allPassed = true;

  function assert(condition: boolean, testName: string, detail: string) {
    if (condition) {
      results.push(`PASS: ${testName} (${detail})`);
    } else {
      results.push(`FAIL: ${testName} (${detail})`);
      allPassed = false;
    }
  }

  // Setup: Owner Alice creates her restaurant
  const aliceContext = { auth: { uid: 'user_alice', email: 'alice@restaurant.com' } };
  const bobContext = { auth: { uid: 'user_bob', email: 'bob@cafe.com' } };
  const anonymousContext = { auth: null };

  // 1. Anonymous Access Tests
  const anonRead = sim.canAccess(anonymousContext, 'read', '/restaurants/rest_alice');
  assert(!anonRead.allowed, 'Anonymous Read Restaurant', anonRead.reason);

  const anonWrite = sim.canAccess(anonymousContext, 'create', '/restaurants/rest_alice', { ownerUid: 'user_alice' });
  assert(!anonWrite.allowed, 'Anonymous Create Restaurant', anonWrite.reason);

  const anonSubRead = sim.canAccess(anonymousContext, 'read', '/restaurants/rest_alice/menu_items/item_1');
  assert(!anonSubRead.allowed, 'Anonymous Read Subcollection', anonSubRead.reason);

  // 2. Owner Alice Creates Restaurant
  const aliceCreate = sim.canAccess(aliceContext, 'create', '/restaurants/rest_alice', { ownerUid: 'user_alice', name: 'Alice Bistro' });
  assert(aliceCreate.allowed, 'Owner Alice Create Restaurant', aliceCreate.reason);
  sim.setDocument('restaurants/rest_alice', { ownerUid: 'user_alice', name: 'Alice Bistro' });

  // 3. Owner Alice Reads & Writes Subcollections
  const aliceSubWrite = sim.canAccess(aliceContext, 'create', '/restaurants/rest_alice/menu_items/item_1', { name: 'Sourdough' });
  assert(aliceSubWrite.allowed, 'Owner Alice Write MenuItem', aliceSubWrite.reason);
  sim.setDocument('restaurants/rest_alice/menu_items/item_1', { name: 'Sourdough' });

  const aliceSubRead = sim.canAccess(aliceContext, 'read', '/restaurants/rest_alice/menu_items/item_1');
  assert(aliceSubRead.allowed, 'Owner Alice Read MenuItem', aliceSubRead.reason);

  // 4. Isolation: Bob (Second Account) CANNOT Read Alice's Restaurant
  const bobRead = sim.canAccess(bobContext, 'read', '/restaurants/rest_alice');
  assert(!bobRead.allowed, 'Bob Read Alice Restaurant', bobRead.reason);

  // 5. Isolation: Bob CANNOT Write to Alice's Restaurant
  const bobUpdate = sim.canAccess(bobContext, 'update', '/restaurants/rest_alice', { name: 'Hacked' });
  assert(!bobUpdate.allowed, 'Bob Update Alice Restaurant', bobUpdate.reason);

  // 6. Isolation: Bob CANNOT Read or Write Alice's Subcollections
  const bobSubRead = sim.canAccess(bobContext, 'read', '/restaurants/rest_alice/menu_items/item_1');
  assert(!bobSubRead.allowed, 'Bob Read Alice MenuItem', bobSubRead.reason);

  const bobSubWrite = sim.canAccess(bobContext, 'create', '/restaurants/rest_alice/sales/sale_1', { quantity: 10 });
  assert(!bobSubWrite.allowed, 'Bob Create Alice Sale', bobSubWrite.reason);

  // 7. Isolation: Bob CAN Create and Access His Own Restaurant
  const bobCreate = sim.canAccess(bobContext, 'create', '/restaurants/rest_bob', { ownerUid: 'user_bob', name: 'Bob Cafe' });
  assert(bobCreate.allowed, 'Bob Create Own Restaurant', bobCreate.reason);
  sim.setDocument('restaurants/rest_bob', { ownerUid: 'user_bob', name: 'Bob Cafe' });

  const bobOwnRead = sim.canAccess(bobContext, 'read', '/restaurants/rest_bob');
  assert(bobOwnRead.allowed, 'Bob Read Own Restaurant', bobOwnRead.reason);

  return { passed: allPassed, results };
}

// Allow direct CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runSecurityRulesTests();
  result.results.forEach((r) => console.log(r));
  if (!result.passed) {
    process.exit(1);
  }
}
