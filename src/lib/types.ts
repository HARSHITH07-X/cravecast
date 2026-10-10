import { z } from 'zod';

// ==========================================
// 1. Restaurant & Settings
// ==========================================

export const ServiceHoursSchema = z.object({
  lunchStart: z.string().default('12:00'),
  lunchEnd: z.string().default('15:30'),
  dinnerStart: z.string().default('19:00'),
  dinnerEnd: z.string().default('23:00'),
});

export const RestaurantSettingsSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Restaurant name is required'),
  city: z.string().min(1, 'City is required'),
  currency: z.string().default('INR'),
  openingDays: z.array(z.string()).default(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  serviceHours: ServiceHoursSchema.default({
    lunchStart: '12:00',
    lunchEnd: '15:30',
    dinnerStart: '19:00',
    dinnerEnd: '23:00',
  }),
  ownerUid: z.string(),
  ownerEmail: z.string().email().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type RestaurantSettings = z.infer<typeof RestaurantSettingsSchema>;

// ==========================================
// 2. Menu Items
// ==========================================

export const MenuItemSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  name: z.string().min(1, 'Dish name is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().default(0),
  prepLeadTimeHours: z.number().default(2),
  shelfLifeDays: z.number().default(2),
  isActive: z.boolean().default(true),
  showToCustomers: z.boolean().default(true),
  hasConfirmedRecipe: z.boolean().default(false),
  recipeId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  notes: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

// ==========================================
// 3. Sales & Import Batches
// ==========================================

export const SaleRecordSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  date: z.string(), // YYYY-MM-DD
  menuItemId: z.string().optional(),
  dishName: z.string().min(1),
  quantitySold: z.number().nonnegative(),
  soldOut: z.boolean().default(false),
  soldOutTime: z.string().optional(), // HH:mm
  batchId: z.string().optional(),
  revenue: z.number().nonnegative().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type SaleRecord = z.infer<typeof SaleRecordSchema>;

export const SalesImportBatchSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  source: z.enum(['csv', 'excel', 'ledger_photo', 'voice', 'manual']),
  filename: z.string().optional(),
  rowCount: z.number().default(0),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).default('completed'),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type SalesImportBatch = z.infer<typeof SalesImportBatchSchema>;

// ==========================================
// 4. Recipes & Ingredients
// ==========================================

export const RecipeIngredientSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  trimWastePercent: z.number().min(0).max(100).default(0),
  costPerUnit: z.number().nonnegative().default(0),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  menuItemId: z.string(),
  dishName: z.string(),
  batchYield: z.number().positive().default(1),
  ingredients: z.array(RecipeIngredientSchema).default([]),
  prepInstructions: z.string().optional(),
  prepStation: z.string().default('Main Line'),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const IngredientSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  name: z.string().min(1),
  category: z.string().default('Dry & Pantry'),
  unit: z.string().default('kg'),
  unitCost: z.number().nonnegative().default(0),
  packageSize: z.number().positive().default(1),
  packageUnit: z.string().default('kg'),
  minOrderQuantity: z.number().positive().default(1),
  leadTimeDays: z.number().int().nonnegative().default(1),
  trimWastePercent: z.number().min(0).max(100).default(0),
  supplierId: z.string().optional(),
  minStockThreshold: z.number().nonnegative().default(2),
  shelfLifeDays: z.number().default(7),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

// ==========================================
// 5. Suppliers & Inventory
// ==========================================

export const SupplierSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().default(1),
  orderCutoffTime: z.string().default('18:00'),
  minimumOrderAmount: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const InventorySchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  ingredientId: z.string(),
  ingredientName: z.string(),
  currentStock: z.number().nonnegative().default(0),
  unit: z.string(),
  lastCountedAt: z.string().default(() => new Date().toISOString()),
  reservedForPrep: z.number().nonnegative().default(0),
  status: z.enum(['ok', 'low', 'out_of_stock']).default('ok'),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Inventory = z.infer<typeof InventorySchema>;

// ==========================================
// 6. Forecasts & Plans
// ==========================================

export const DishForecastSchema = z.object({
  menuItemId: z.string(),
  dishName: z.string(),
  p10: z.number().nonnegative(),
  p50: z.number().nonnegative(),
  p90: z.number().nonnegative(),
  modelBreakdown: z.record(z.string(), z.number()).optional(),
  actualDemand: z.number().optional(),
  stockoutRisk: z.number().min(0).max(1).default(0),
});
export type DishForecast = z.infer<typeof DishForecastSchema>;

export const ForecastSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  date: z.string(), // YYYY-MM-DD
  dishForecasts: z.array(DishForecastSchema),
  calculatedAt: z.string().default(() => new Date().toISOString()),
});
export type Forecast = z.infer<typeof ForecastSchema>;

export const PrepPlanItemSchema = z.object({
  menuItemId: z.string(),
  dishName: z.string(),
  prepQuantity: z.number().nonnegative(),
  unit: z.string().default('portions'),
  recipeId: z.string().optional(),
  station: z.string().default('Main Kitchen'),
  expectedDemandP50: z.number(),
  upperBufferP90: z.number(),
  explanation: z.string(),
});
export type PrepPlanItem = z.infer<typeof PrepPlanItemSchema>;

export const OrderPlanItemSchema = z.object({
  ingredientId: z.string(),
  ingredientName: z.string(),
  orderQuantity: z.number().nonnegative(),
  unit: z.string(),
  packageCount: z.number().default(1),
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  reason: z.string(),
});
export type OrderPlanItem = z.infer<typeof OrderPlanItemSchema>;

export const PlanSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  date: z.string(), // YYYY-MM-DD
  prepItems: z.array(PrepPlanItemSchema),
  orderItems: z.array(OrderPlanItemSchema),
  explanations: z.array(z.string()).default([]),
  status: z.enum(['draft', 'approved', 'completed']).default('draft'),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Plan = z.infer<typeof PlanSchema>;

// ==========================================
// 7. Feedback & Learning
// ==========================================

export const DishFeedbackItemSchema = z.object({
  menuItemId: z.string(),
  dishName: z.string(),
  plannedQty: z.number(),
  actualSold: z.number(),
  wasteQty: z.number().default(0),
  soldOut: z.boolean().default(false),
  soldOutTime: z.string().optional(),
  feedbackNotes: z.string().optional(),
});
export type DishFeedbackItem = z.infer<typeof DishFeedbackItemSchema>;

export const FeedbackSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  date: z.string(), // YYYY-MM-DD
  dishFeedback: z.array(DishFeedbackItemSchema),
  chefRating: z.number().min(1).max(5).default(5),
  generalNotes: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// ==========================================
// 8. Agent Runs & Audits
// ==========================================

export const AgentRunSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  agentType: z.enum(['planner', 'explainer', 'critic', 'parser', 'mood_analyzer']),
  status: z.enum(['started', 'completed', 'failed']),
  inputs: z.record(z.string(), z.any()).default({}),
  outputs: z.record(z.string(), z.any()).default({}),
  trace: z.array(z.string()).default([]),
  tokenUsage: z.number().default(0),
  durationMs: z.number().default(0),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

// ==========================================
// 9. Mood Events & Customer Sentiment
// ==========================================

export const MoodEventSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  timestamp: z.string().default(() => new Date().toISOString()),
  guestSessionId: z.string(),
  moodNotes: z.string(),
  requestedDishes: z.array(z.string()).default([]),
  suggestedDishes: z.array(z.string()).default([]),
  weatherContext: z.string().optional(),
  sentimentScore: z.number().default(0),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type MoodEvent = z.infer<typeof MoodEventSchema>;

// ==========================================
// 10. Local Events & Festivals
// ==========================================

export const EventDaySchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  date: z.string(), // YYYY-MM-DD
  eventName: z.string().min(1),
  eventType: z.enum(['festival', 'concert', 'sports', 'holiday', 'local_event']),
  expectedImpact: z.enum(['surge', 'normal', 'dip']).default('surge'),
  notes: z.string().optional(),
  source: z.string().optional(),
  approvedByOwner: z.boolean().default(false),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type EventDay = z.infer<typeof EventDaySchema>;

// ==========================================
// 11. Weather Cache
// ==========================================

export const WeatherCacheSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string(),
  date: z.string(), // YYYY-MM-DD
  city: z.string(),
  condition: z.string(),
  tempMin: z.number(),
  tempMax: z.number(),
  precipitationChance: z.number().min(0).max(100),
  humidity: z.number().min(0).max(100),
  fetchedAt: z.string().default(() => new Date().toISOString()),
});
export type WeatherCache = z.infer<typeof WeatherCacheSchema>;
