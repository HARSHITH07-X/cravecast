import { FunctionDeclaration, Type } from '@google/genai';
import type { FirestoreClient } from '../lib/firestoreRest.js';

export interface InventoryItemOutput {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  unit: string;
  category?: string;
  unitCost?: number;
}

export interface InventoryToolOutput {
  inventory: InventoryItemOutput[];
  totalItems: number;
  hasStockEntered: boolean;
  hasNegativeStock: boolean;
  negativeStockItems: Array<{ ingredientId: string; ingredientName: string; currentStock: number }>;
}

export const getInventoryToolDeclaration: FunctionDeclaration = {
  name: 'get_inventory',
  description: 'Retrieves current on-hand kitchen stock quantities for all ingredients to deduct against prep requirements.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      restaurantId: {
        type: Type.STRING,
        description: 'The unique restaurant ID.',
      },
    },
    required: ['restaurantId'],
  },
};

/**
 * Fetches current inventory stock and ingredient metadata from Firestore.
 */
export async function executeGetInventory(
  restaurantId: string,
  db?: FirestoreClient
): Promise<InventoryToolOutput> {
  const inventoryList: InventoryItemOutput[] = [];
  const negativeStockItems: Array<{ ingredientId: string; ingredientName: string; currentStock: number }> = [];

  if (!db) {
    return {
      inventory: [],
      totalItems: 0,
      hasStockEntered: false,
      hasNegativeStock: false,
      negativeStockItems: [],
    };
  }

  try {
    // 1. Fetch ingredients list
    const ingSnap = await db
      .collection(`restaurants/${restaurantId}/ingredients`)
      .limit(300)
      .get();
    const ingMap = new Map<string, any>();
    for (const doc of ingSnap.docs) {
      ingMap.set(doc.id, { id: doc.id, ...doc.data() });
    }

    // 2. Fetch inventory records
    const invSnap = await db
      .collection(`restaurants/${restaurantId}/inventory`)
      .limit(300)
      .get();
    const invMap = new Map<string, any>();
    for (const doc of invSnap.docs) {
      invMap.set(doc.id, doc.data());
    }

    // 3. Assemble unified inventory list
    for (const [ingId, ingData] of ingMap.entries()) {
      const invData = invMap.get(ingId);
      const rawStock = invData?.currentStock !== undefined ? Number(invData.currentStock) : 0;
      const unit = ingData.unit || invData?.unit || 'kg';

      if (rawStock < 0) {
        negativeStockItems.push({
          ingredientId: ingId,
          ingredientName: ingData.name || 'Unknown Ingredient',
          currentStock: rawStock,
        });
      }

      inventoryList.push({
        ingredientId: ingId,
        ingredientName: ingData.name || 'Ingredient',
        currentStock: rawStock,
        unit,
        category: ingData.category,
        unitCost: Number(ingData.unitCost) || 0,
      });
    }

    // Also include any inventory docs that weren't in ingredients list
    for (const [invId, invData] of invMap.entries()) {
      if (!ingMap.has(invId)) {
        const rawStock = Number(invData.currentStock) || 0;
        if (rawStock < 0) {
          negativeStockItems.push({
            ingredientId: invId,
            ingredientName: invData.ingredientName || 'Unnamed Ingredient',
            currentStock: rawStock,
          });
        }
        inventoryList.push({
          ingredientId: invId,
          ingredientName: invData.ingredientName || 'Ingredient',
          currentStock: rawStock,
          unit: invData.unit || 'units',
        });
      }
    }
  } catch (err) {
    console.error(`[get_inventory] Error fetching inventory from DB:`, err);
  }

  const hasStockEntered = inventoryList.some((i) => i.currentStock > 0);
  const hasNegativeStock = negativeStockItems.length > 0;

  return {
    inventory: inventoryList,
    totalItems: inventoryList.length,
    hasStockEntered,
    hasNegativeStock,
    negativeStockItems,
  };
}
