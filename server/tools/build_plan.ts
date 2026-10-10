import { FunctionDeclaration, Type } from '@google/genai';
import type { FirestoreClient } from '../lib/firestoreRest.js';
import {
  executeDailyPlan,
  DailyPlanOutput,
  PlannerExecutionInput,
} from '../planner.js';
import { ForecastResult, DayFeatures } from '../forecast/types.js';
import { buildFeatureDictionary } from '../forecast/engine.js';
import {
  compute4WeekFeedbackAdjustments,
  FeedbackObservation,
  DishBiasAdjustment,
} from '../forecast/learningLoop.js';

export interface BuildPlanOptions {
  serviceLevelSlider?: number;
  stockOverrides?: Record<string, number>;
  dishPortionCaps?: Record<string, number>;
  historicalMaxMap?: Record<string, number>;
  testNegativeStock?: boolean;
  dishFeedbackAdjustment?: Record<string, number>;
  feedbackDetailsByDishId?: Record<string, DishBiasAdjustment>;
  testFixtures?: {
    menuItems?: any[];
    recipes?: any[];
    ingredients?: any[];
    suppliers?: any[];
    inventory?: any[];
  };
}

export interface BuildPlanToolOutput {
  plan: DailyPlanOutput;
  historicalMaxMap: Record<string, number>;
}

export const buildPlanToolDeclaration: FunctionDeclaration = {
  name: 'build_plan',
  description: 'Constructs the comprehensive daily kitchen prep sheet and supplier purchase order list from demand forecasts, inventory levels, recipes, 4-week feedback bias corrections, and newsvendor service constraints.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      restaurantId: {
        type: Type.STRING,
        description: 'The unique restaurant ID.',
      },
      targetDate: {
        type: Type.STRING,
        description: 'Target calendar date in YYYY-MM-DD format.',
      },
      serviceLevelSlider: {
        type: Type.NUMBER,
        description: 'Service level quantile between 0.50 and 0.99 (default 0.85).',
      },
    },
    required: ['restaurantId', 'targetDate'],
  },
};

/**
 * Builds the daily kitchen plan and returns computed prep items and supplier order lists.
 * Zero fake data: never injects hardcoded menu items, recipes, or ingredients in production.
 */
export async function executeBuildPlan(
  restaurantId: string,
  targetDate: string,
  forecasts: ForecastResult[],
  db?: FirestoreClient,
  options?: BuildPlanOptions,
  contextData?: {
    weatherList?: any[];
    eventsList?: any[];
  }
): Promise<BuildPlanToolOutput> {
  let restaurantName = 'Kitchen';

  let menuItems: any[] = options?.testFixtures?.menuItems ? [...options.testFixtures.menuItems] : [];
  let recipes: any[] = options?.testFixtures?.recipes ? [...options.testFixtures.recipes] : [];
  let ingredients: any[] = options?.testFixtures?.ingredients ? [...options.testFixtures.ingredients] : [];
  let suppliers: any[] = options?.testFixtures?.suppliers ? [...options.testFixtures.suppliers] : [];
  let inventory: any[] = options?.testFixtures?.inventory ? [...options.testFixtures.inventory] : [];
  const historicalMaxMap: Record<string, number> = options?.historicalMaxMap ? { ...options.historicalMaxMap } : {};
  let dishFeedbackAdjustment: Record<string, number> = options?.dishFeedbackAdjustment || {};
  let feedbackDetailsByDishId: Record<string, DishBiasAdjustment> = options?.feedbackDetailsByDishId || {};

  if (db) {
    // 1. Restaurant
    try {
      const restDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (restDoc.exists) restaurantName = restDoc.data()?.name || 'Kitchen';
    } catch {}

    // 2. Menu Items
    const menuSnap = await db.collection(`restaurants/${restaurantId}/menu_items`).limit(100).get();
    menuItems = menuSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // 3. Recipes
    const recipeSnap = await db.collection(`restaurants/${restaurantId}/recipes`).limit(100).get();
    recipes = recipeSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // 4. Ingredients
    const ingSnap = await db.collection(`restaurants/${restaurantId}/ingredients`).limit(200).get();
    ingredients = ingSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // 5. Suppliers
    const supSnap = await db.collection(`restaurants/${restaurantId}/suppliers`).limit(50).get();
    suppliers = supSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // 6. Inventory
    const invSnap = await db.collection(`restaurants/${restaurantId}/inventory`).limit(200).get();
    inventory = invSnap.docs.map((d: any) => ({ ingredientId: d.id, ...d.data() }));

    // 7. Sales & 4-Week Learning Loop Feedback
    let salesRecords: any[] = [];
    try {
      const salesSnap = await db.collection(`restaurants/${restaurantId}/sales`).limit(1000).get();
      for (const doc of salesSnap.docs) {
        const s = doc.data();
        salesRecords.push(s);
        const dishId = s.menuItemId;
        const qty = Number(s.quantitySold) || 0;
        if (dishId && Object.keys(options?.historicalMaxMap || {}).length === 0) {
          historicalMaxMap[dishId] = Math.max(historicalMaxMap[dishId] || 0, qty);
        }
      }
    } catch (err) {
      console.warn('Could not compute historical max sales map:', err);
    }

    if (Object.keys(dishFeedbackAdjustment).length === 0) {
      try {
        const fbSnap = await db.collection(`restaurants/${restaurantId}/feedback`).limit(200).get();
        const feedbackRecords = fbSnap.docs.map((d: any) => ({
          id: d.id,
          ...d.data(),
        })) as FeedbackObservation[];

        const loop = compute4WeekFeedbackAdjustments({
          targetDate,
          forecasts,
          feedbackRecords,
          salesRecords,
        });
        dishFeedbackAdjustment = loop.deltaMap;
        feedbackDetailsByDishId = loop.adjustmentsByDishId;
      } catch (err) {
        console.warn('Could not compute 4-week feedback adjustments:', err);
      }
    }
  }

  // Handle testNegativeStock injection if requested for Critic verification
  if (options?.testNegativeStock && inventory.length > 0) {
    inventory[0] = {
      ...inventory[0],
      currentStock: -5,
    };
  }

  // 8. Day features
  const weatherList = contextData?.weatherList || [];
  const eventsList = contextData?.eventsList || [];
  const allFeatures = buildFeatureDictionary([targetDate], weatherList, eventsList);
  const dayFeatures: DayFeatures | undefined = allFeatures[0];

  // 9. Planner execution input
  const plannerInput: PlannerExecutionInput = {
    restaurantId,
    restaurantName,
    targetDate,
    serviceLevelSlider: options?.serviceLevelSlider ?? 0.85,
    forecasts,
    menuItems,
    recipes,
    ingredients,
    suppliers,
    inventory,
    dayFeatures,
    dishFeedbackAdjustment,
    feedbackDetailsByDishId,
    stockOverrides: options?.stockOverrides,
    dishPortionCaps: options?.dishPortionCaps,
    historicalMaxMap,
  };

  const plan = executeDailyPlan(plannerInput);

  return {
    plan,
    historicalMaxMap,
  };
}
