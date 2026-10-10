import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Camera,
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  ChefHat,
  Loader2,
  Search,
  Filter,
  Check,
  X,
  FileText,
  Merge,
  ArrowRight,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';

const COMMON_ALLERGENS = [
  'Dairy',
  'Gluten',
  'Tree Nuts',
  'Peanuts',
  'Eggs',
  'Soy',
  'Shellfish',
  'Fish',
  'Sesame',
  'Mustard',
];

const STANDARD_CATEGORIES = [
  'All Categories',
  'Starters & Small Plates',
  'Main Course',
  'Biryanis & Rice',
  'Breads & Tandoor',
  'Desserts',
  'Beverages',
  'Sides & Accompaniments',
];

interface IngredientRow {
  ingredientId?: string;
  name: string;
  quantity: number;
  unit: string;
  trimWastePercent?: number;
  costPerUnit?: number;
  shelfLifeDays?: number;
  supplierId?: string;
  packageSize?: number;
  packageUnit?: string;
  minOrderQuantity?: number;
  leadTimeDays?: number;
}

export const MenuView: React.FC = () => {
  const { restaurant, idToken } = useAuth();

  // Menu items state
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'missing'>('all');

  // Add/Edit Dish Modal
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [dishForm, setDishForm] = useState({
    name: '',
    category: 'Main Course',
    description: '',
    price: 0,
    cost: 0,
    prepLeadTimeHours: 2,
    shelfLifeDays: 2,
    tags: [] as string[],
    allergens: [] as string[],
    showToCustomers: true,
  });
  const [savingDish, setSavingDish] = useState(false);
  const [proposingTags, setProposingTags] = useState(false);

  // Recipe Builder Modal
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [activeDishForRecipe, setActiveDishForRecipe] = useState<any | null>(null);
  const [recipeInputMethod, setRecipeInputMethod] = useState<'text' | 'photo'>('text');
  const [recipeRawText, setRecipeRawText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [parsingRecipe, setParsingRecipe] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [batchYield, setBatchYield] = useState(1);
  const [prepStation, setPrepStation] = useState('Main Line');
  const [prepInstructions, setPrepInstructions] = useState('');
  const [stagedIngredients, setStagedIngredients] = useState<IngredientRow[]>([]);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeSuccessNotice, setRecipeSuccessNotice] = useState<string | null>(null);

  // Vector Match & Merge Modal
  const [vectorModalOpen, setVectorModalOpen] = useState(false);
  const [matchQuery, setMatchQuery] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);

  // Load Menu Items
  const fetchMenuItems = async () => {
    if (!idToken) return;
    setLoadingItems(true);
    try {
      const res = await fetch('/api/menu/items', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Fetch menu items failed:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, [idToken]);

  // -------------------------------------------------------------
  // DISH CRUD & TAG PROPOSALS
  // -------------------------------------------------------------
  const handleOpenAddDish = () => {
    setEditingDishId(null);
    setDishForm({
      name: '',
      category: 'Main Course',
      description: '',
      price: 0,
      cost: 0,
      prepLeadTimeHours: 2,
      shelfLifeDays: 2,
      tags: [],
      allergens: [],
      showToCustomers: true,
    });
    setDishModalOpen(true);
  };

  const handleOpenEditDish = (dish: any) => {
    setEditingDishId(dish.id);
    setDishForm({
      name: dish.name || '',
      category: dish.category || 'Main Course',
      description: dish.description || '',
      price: dish.price || 0,
      cost: dish.cost || 0,
      prepLeadTimeHours: dish.prepLeadTimeHours || 2,
      shelfLifeDays: dish.shelfLifeDays || 2,
      tags: dish.tags || [],
      allergens: dish.allergens || [],
      showToCustomers: dish.showToCustomers !== false,
    });
    setDishModalOpen(true);
  };

  const handleSuggestTags = async () => {
    if (!dishForm.name.trim()) {
      alert('Please enter a dish name first.');
      return;
    }
    setProposingTags(true);
    try {
      const res = await fetch('/api/menu/suggest-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          dishName: dishForm.name,
          description: dishForm.description,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const proposed = data.tags || [];
        // Union with current tags
        const combined = Array.from(new Set([...dishForm.tags, ...proposed]));
        setDishForm({ ...dishForm, tags: combined });
      }
    } catch (err) {
      console.error('Suggest tags error:', err);
    } finally {
      setProposingTags(false);
    }
  };

  const toggleAllergen = (allergen: string) => {
    if (dishForm.allergens.includes(allergen)) {
      setDishForm({
        ...dishForm,
        allergens: dishForm.allergens.filter((a) => a !== allergen),
      });
    } else {
      setDishForm({
        ...dishForm,
        allergens: [...dishForm.allergens, allergen],
      });
    }
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishForm.name.trim()) return;

    setSavingDish(true);
    try {
      const url = editingDishId ? `/api/menu/items/${editingDishId}` : '/api/menu/items';
      const method = editingDishId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(dishForm),
      });

      if (!res.ok) throw new Error('Failed to save dish');

      await fetchMenuItems();
      setDishModalOpen(false);
    } catch (err: any) {
      console.error('Save dish error:', err);
      alert(err.message || 'Could not save menu item');
    } finally {
      setSavingDish(false);
    }
  };

  const handleToggleCustomerVisibility = async (dish: any) => {
    try {
      await fetch(`/api/menu/items/${dish.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ showToCustomers: !dish.showToCustomers }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === dish.id ? { ...item, showToCustomers: !item.showToCustomers } : item
        )
      );
    } catch (err) {
      console.error('Toggle visibility error:', err);
    }
  };

  const handleDeleteDish = async (dishId: string) => {
    if (!confirm('Are you sure you want to remove this dish from the menu?')) return;
    try {
      await fetch(`/api/menu/items/${dishId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });
      setItems((prev) => prev.filter((i) => i.id !== dishId));
    } catch (err) {
      console.error('Delete dish error:', err);
    }
  };

  // -------------------------------------------------------------
  // RECIPE PARSER & BUILDER
  // -------------------------------------------------------------
  const handleOpenRecipeModal = async (dish: any) => {
    setActiveDishForRecipe(dish);
    setRecipeRawText('');
    setParseError(null);
    setStagedIngredients([]);
    setBatchYield(1);
    setPrepStation('Main Line');
    setPrepInstructions('');
    setRecipeSuccessNotice(null);

    // If dish already has a confirmed recipe, load it
    if (dish.hasConfirmedRecipe) {
      try {
        const res = await fetch(`/api/menu/recipe/${dish.id}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.recipe) {
            setBatchYield(data.recipe.batchYield || 1);
            setPrepStation(data.recipe.prepStation || 'Main Line');
            setPrepInstructions(data.recipe.prepInstructions || '');
            setStagedIngredients(data.recipe.ingredients || []);
          }
        }
      } catch (e) {
        console.warn('Could not fetch existing recipe:', e);
      }
    }

    setRecipeModalOpen(true);
  };

  const handleStartSpeechForRecipe = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Browser speech recognition not supported in this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-IN';
    rec.onstart = () => setIsRecording(true);
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setRecipeRawText((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.start();
  };

  const handleParseRecipeText = async () => {
    if (!recipeRawText.trim()) return;
    setParsingRecipe(true);
    setParseError(null);

    try {
      const res = await fetch('/api/menu/parse-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          dishName: activeDishForRecipe?.name,
          text: recipeRawText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setParseError(data.message || 'Failed to parse recipe. Your original text is preserved.');
        return;
      }

      if (data.parsed) {
        setBatchYield(data.parsed.batchYield || 1);
        setPrepInstructions(data.parsed.prepInstructions || '');
        const rows: IngredientRow[] = (data.parsed.ingredients || []).map((ing: any) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          shelfLifeDays: ing.shelfLifeDays || 7,
          trimWastePercent: 0,
          costPerUnit: 0,
        }));
        setStagedIngredients(rows);
      }
    } catch (err: any) {
      console.error('Parse error:', err);
      setParseError('Network error while parsing recipe. Please verify inputs.');
    } finally {
      setParsingRecipe(false);
    }
  };

  const handlePhotoRecipeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingRecipe(true);
    setParseError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        const res = await fetch('/api/menu/parse-recipe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            dishName: activeDishForRecipe?.name,
            imageBase64: base64Data,
            mimeType,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setParseError(data.message || 'Could not parse recipe photo. Try typing or speaking.');
          setParsingRecipe(false);
          return;
        }

        if (data.parsed) {
          setBatchYield(data.parsed.batchYield || 1);
          setPrepInstructions(data.parsed.prepInstructions || '');
          const rows: IngredientRow[] = (data.parsed.ingredients || []).map((ing: any) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            shelfLifeDays: ing.shelfLifeDays || 7,
            trimWastePercent: 0,
            costPerUnit: 0,
          }));
          setStagedIngredients(rows);
        }
        setParsingRecipe(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setParseError('Error reading photo file.');
      setParsingRecipe(false);
    }
  };

  const handleAddManualIngredientRow = () => {
    setStagedIngredients([
      ...stagedIngredients,
      { name: '', quantity: 1, unit: 'g', trimWastePercent: 0, costPerUnit: 0, shelfLifeDays: 7 },
    ]);
  };

  const handleSaveRecipe = async () => {
    if (stagedIngredients.length === 0) {
      alert('Please add at least one ingredient.');
      return;
    }

    setSavingRecipe(true);
    try {
      const res = await fetch('/api/menu/save-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          menuItemId: activeDishForRecipe.id,
          dishName: activeDishForRecipe.name,
          batchYield,
          prepStation,
          prepInstructions,
          ingredients: stagedIngredients,
        }),
      });

      if (!res.ok) throw new Error('Failed to save recipe');

      setRecipeSuccessNotice(`Recipe for ${activeDishForRecipe.name} saved and verified!`);
      await fetchMenuItems();
      setTimeout(() => {
        setRecipeModalOpen(false);
      }, 1200);
    } catch (err: any) {
      alert('Could not save recipe: ' + err.message);
    } finally {
      setSavingRecipe(false);
    }
  };

  // -------------------------------------------------------------
  // VECTOR DISH MATCHING & NEAR-DUPLICATE MERGE
  // -------------------------------------------------------------
  const handlePerformVectorMatch = async () => {
    if (!matchQuery.trim()) return;
    setMatching(true);
    setMergeNotice(null);
    try {
      const res = await fetch('/api/menu/match-dish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ queryName: matchQuery.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setMatchResults(data.matches || []);
      }
    } catch (err) {
      console.error('Vector match error:', err);
    } finally {
      setMatching(false);
    }
  };

  const handleMergeDish = async (targetDishId: string, targetDishName: string) => {
    if (!confirm(`Merge all sales of '${matchQuery}' into '${targetDishName}'?`)) return;
    setMerging(true);
    try {
      const res = await fetch('/api/menu/merge-dishes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sourceDishName: matchQuery.trim(),
          targetDishId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMergeNotice(data.message);
        await fetchMenuItems();
      }
    } catch (err: any) {
      alert('Merge failed: ' + err.message);
    } finally {
      setMerging(false);
    }
  };

  // Filtered menu items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'All Categories' || item.category === selectedCategory;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'confirmed'
        ? item.hasConfirmedRecipe
        : !item.hasConfirmedRecipe;
    return matchesSearch && matchesCategory && matchesStatus && item.isActive !== false;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#24463D] pb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
            Menu Catalog & Recipe Specs
          </h1>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-1">
            Turn plain-language recipes into portioned ingredient formulas for deterministic prep planning.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setMatchQuery('');
              setMatchResults([]);
              setMergeNotice(null);
              setVectorModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#18332C] hover:bg-[#20443B] border border-[#2F5D50] text-[#E0A526] transition-colors"
          >
            <Merge className="w-4 h-4" />
            <span>Vector Match & Merge</span>
          </button>

          <button
            onClick={handleOpenAddDish}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-colors shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu Item</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#142823] border border-[#24463D]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#FBF6EE]/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dish by name or category..."
            className="w-full pl-10 pr-4 py-2 bg-[#0F1F1B] border border-[#24463D] focus:border-[#E0A526] rounded-xl text-xs text-[#FBF6EE] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-xs text-[#FBF6EE] focus:outline-none"
          >
            {STANDARD_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex items-center p-0.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-[#2F5D50] text-[#FBF6EE]'
                  : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
              }`}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setStatusFilter('confirmed')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'confirmed'
                  ? 'bg-[#2F5D50] text-[#FBF6EE]'
                  : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
              }`}
            >
              Recipes ({items.filter((i) => i.hasConfirmedRecipe).length})
            </button>
            <button
              onClick={() => setStatusFilter('missing')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'missing'
                  ? 'bg-[#2F5D50] text-[#FBF6EE]'
                  : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
              }`}
            >
              Missing ({items.filter((i) => !i.hasConfirmedRecipe).length})
            </button>
          </div>
        </div>
      </div>

      {/* Menu Dishes Grid / Table */}
      {loadingItems ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#E0A526] mx-auto mb-2" />
          <span className="text-xs text-[#FBF6EE]/60">Loading kitchen menu...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] mx-auto">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <h3 className="font-serif text-xl font-bold text-[#FBF6EE]">No menu items found</h3>
          <p className="text-xs text-[#FBF6EE]/70 leading-relaxed">
            Menu catalog starts empty until you import sales data or manually add your restaurant signature dishes.
          </p>
          <button
            onClick={handleOpenAddDish}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE]"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Dish</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((dish) => (
            <div
              key={dish.id}
              className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 flex flex-col justify-between shadow-md hover:border-[#3D7364] transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E0A526] block">
                      {dish.category}
                    </span>
                    <h3 className="font-serif text-lg font-bold text-[#FBF6EE] leading-snug">
                      {dish.name}
                    </h3>
                  </div>

                  <div className="text-right">
                    <span className="font-serif text-base font-bold text-[#FBF6EE] block">
                      {restaurant?.currency} {dish.price}
                    </span>
                    {dish.cost > 0 && (
                      <span className="text-[10px] text-[#FBF6EE]/50 block">Cost: {dish.cost}</span>
                    )}
                  </div>
                </div>

                {dish.description && (
                  <p className="text-xs text-[#FBF6EE]/70 mb-3 line-clamp-2">{dish.description}</p>
                )}

                {/* Tags and Allergens */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(dish.tags || []).map((t: string) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-[#0F1F1B] border border-[#24463D] text-[10px] text-[#FBF6EE]/80"
                    >
                      {t}
                    </span>
                  ))}
                  {(dish.allergens || []).map((a: string) => (
                    <span
                      key={a}
                      className="px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800 text-[10px] text-amber-200"
                    >
                      Allergen: {a}
                    </span>
                  ))}
                </div>

                {/* Recipe Status */}
                <div className="p-2.5 rounded-xl bg-[#0F1F1B] border border-[#24463D] flex items-center justify-between text-xs mb-4">
                  <span className="text-[#FBF6EE]/60">Recipe Spec:</span>
                  {dish.hasConfirmedRecipe ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmed</span>
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Missing</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-[#24463D]/60 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleToggleCustomerVisibility(dish)}
                  className={`inline-flex items-center gap-1.5 text-[11px] ${
                    dish.showToCustomers
                      ? 'text-emerald-300 hover:text-emerald-200'
                      : 'text-[#FBF6EE]/40 hover:text-[#FBF6EE]'
                  }`}
                  title="Toggle visibility in customer mood chat"
                >
                  {dish.showToCustomers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{dish.showToCustomers ? 'In Chat' : 'Hidden'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenRecipeModal(dish)}
                    className="px-3 py-1.5 rounded-lg bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] font-semibold text-[11px] transition-colors"
                  >
                    {dish.hasConfirmedRecipe ? 'Edit Recipe' : '+ Add Recipe'}
                  </button>

                  <button
                    onClick={() => handleOpenEditDish(dish)}
                    className="p-1.5 text-[#FBF6EE]/60 hover:text-[#FBF6EE] rounded-lg hover:bg-[#18332C]"
                    title="Edit Dish Properties"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteDish(dish.id)}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-950/40"
                    title="Archive Dish"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: ADD / EDIT DISH                                     */}
      {/* ============================================================ */}
      {dishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="max-w-xl w-full my-8 rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-8 text-[#FBF6EE] shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#24463D] mb-6">
              <h3 className="font-serif text-xl font-bold">
                {editingDishId ? 'Edit Dish Details' : 'Add New Menu Item'}
              </h3>
              <button onClick={() => setDishModalOpen(false)} className="text-[#FBF6EE]/60 hover:text-[#FBF6EE]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDish} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#FBF6EE]/70 font-semibold mb-1">Dish Name *</label>
                <input
                  type="text"
                  required
                  value={dishForm.name}
                  onChange={(e) => setDishForm({ ...dishForm, name: e.target.value })}
                  placeholder="e.g. Hyderabadi Mutton Biryani"
                  className="w-full p-2.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-[#FBF6EE]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#FBF6EE]/70 font-semibold mb-1">Category</label>
                  <select
                    value={dishForm.category}
                    onChange={(e) => setDishForm({ ...dishForm, category: e.target.value })}
                    className="w-full p-2.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-[#FBF6EE]"
                  >
                    {STANDARD_CATEGORIES.filter((c) => c !== 'All Categories').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#FBF6EE]/70 font-semibold mb-1">
                    Selling Price ({restaurant?.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={dishForm.price || ''}
                    onChange={(e) =>
                      setDishForm({ ...dishForm, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full p-2.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-[#FBF6EE]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#FBF6EE]/70 font-semibold">Dish Description</label>
                  <button
                    type="button"
                    onClick={handleSuggestTags}
                    disabled={proposingTags || !dishForm.name}
                    className="text-[#E0A526] hover:underline flex items-center gap-1"
                  >
                    {proposingTags ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>Propose Tags</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={dishForm.description}
                  onChange={(e) => setDishForm({ ...dishForm, description: e.target.value })}
                  placeholder="Fragrant long-grain basmati with slow-cooked marinated lamb..."
                  className="w-full p-2.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-[#FBF6EE]"
                />
              </div>

              {/* Tags confirmation */}
              {dishForm.tags.length > 0 && (
                <div>
                  <label className="block text-[#FBF6EE]/70 font-semibold mb-1">
                    Confirmed Culinary Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {dishForm.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-[#2F5D50] text-[#FBF6EE] flex items-center gap-1"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDishForm({ ...dishForm, tags: dishForm.tags.filter((t) => t !== tag) })
                          }
                          className="hover:text-red-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Strict Manual Allergen Multi-select (NEVER INFERRED) */}
              <div className="p-3.5 rounded-2xl bg-[#0F1F1B] border border-[#24463D] space-y-2">
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Manual Allergen Declaration (Owner Confirmed Only)</span>
                </div>
                <p className="text-[11px] text-[#FBF6EE]/60">
                  Per security regulations, allergens are never inferred by AI. Check all that apply:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {COMMON_ALLERGENS.map((allergen) => {
                    const isChecked = dishForm.allergens.includes(allergen);
                    return (
                      <label key={allergen} className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAllergen(allergen)}
                          className="rounded text-[#C8553D]"
                        />
                        <span className={isChecked ? 'text-amber-300 font-medium' : 'text-[#FBF6EE]/70'}>
                          {allergen}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Show to Customers Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dishForm.showToCustomers}
                    onChange={(e) => setDishForm({ ...dishForm, showToCustomers: e.target.checked })}
                    className="rounded text-[#C8553D]"
                  />
                  <span>Show dish to customers in mood recommendation chat</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#24463D]">
                <button
                  type="button"
                  onClick={() => setDishModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-[#FBF6EE]/60 hover:text-[#FBF6EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDish}
                  className="px-6 py-2.5 rounded-xl font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] flex items-center gap-2"
                >
                  {savingDish ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Dish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: RECIPE BUILDER (PLAIN TEXT / VOICE / PHOTO)          */}
      {/* ============================================================ */}
      {recipeModalOpen && activeDishForRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="max-w-3xl w-full my-8 rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-8 text-[#FBF6EE] shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#24463D]">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E0A526]">
                  Recipe Specification
                </span>
                <h3 className="font-serif text-2xl font-bold">{activeDishForRecipe.name}</h3>
              </div>
              <button onClick={() => setRecipeModalOpen(false)} className="text-[#FBF6EE]/60 hover:text-[#FBF6EE]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {recipeSuccessNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{recipeSuccessNotice}</span>
              </div>
            )}

            {/* Input Selection: Text/Voice vs Photo */}
            <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#E0A526] uppercase tracking-wider">
                  Describe Recipe Ingredients
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRecipeInputMethod('text')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      recipeInputMethod === 'text' ? 'bg-[#2F5D50] text-[#FBF6EE]' : 'text-[#FBF6EE]/50'
                    }`}
                  >
                    Type / Voice
                  </button>
                  <button
                    onClick={() => setRecipeInputMethod('photo')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      recipeInputMethod === 'photo' ? 'bg-[#2F5D50] text-[#FBF6EE]' : 'text-[#FBF6EE]/50'
                    }`}
                  >
                    Photo of Card
                  </button>
                </div>
              </div>

              {recipeInputMethod === 'text' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={recipeRawText}
                      onChange={(e) => setRecipeRawText(e.target.value)}
                      placeholder='e.g. "biryani uses 250g basmati rice, 200g chicken, 2 onions, 30g whole spices, 20g ghee"'
                      className="w-full p-3 bg-[#142823] border border-[#24463D] rounded-xl text-xs text-[#FBF6EE] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleStartSpeechForRecipe}
                      className={`absolute right-3 bottom-3 p-1.5 rounded-lg ${
                        isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-[#0F1F1B] text-[#E0A526]'
                      }`}
                      title="Speak recipe"
                    >
                      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={handleParseRecipeText}
                    disabled={parsingRecipe || !recipeRawText.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] disabled:opacity-50 text-[#FBF6EE]"
                  >
                    {parsingRecipe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#E0A526]" />}
                    <span>Parse Into Structured Ingredients</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoRecipeUpload}
                    className="block w-full text-xs text-[#FBF6EE]/80 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#C8553D] file:text-[#FBF6EE]"
                  />
                  {parsingRecipe && (
                    <div className="flex items-center gap-2 text-xs text-[#E0A526]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transcribing recipe card from image...</span>
                    </div>
                  )}
                </div>
              )}

              {parseError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs">
                  {parseError}
                </div>
              )}
            </div>

            {/* Editable Staging Ingredients Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h4 className="font-serif text-base font-bold text-[#FBF6EE]">Ingredient Breakdown</h4>
                  <div className="flex items-center gap-1.5 text-xs text-[#FBF6EE]/70">
                    <span>Batch Yield:</span>
                    <input
                      type="number"
                      min={1}
                      value={batchYield}
                      onChange={(e) => setBatchYield(parseInt(e.target.value) || 1)}
                      className="w-14 px-2 py-1 bg-[#0F1F1B] border border-[#24463D] rounded text-center text-xs text-[#FBF6EE]"
                    />
                    <span>portions</span>
                  </div>
                </div>

                <button
                  onClick={handleAddManualIngredientRow}
                  className="text-xs text-[#E0A526] hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </button>
              </div>

              {stagedIngredients.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#0F1F1B] border border-[#24463D] text-center text-xs text-[#FBF6EE]/50">
                  No ingredients added yet. Type or photograph the recipe above, or add lines manually.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#24463D] rounded-2xl max-h-64">
                  <table className="w-full text-left text-xs text-[#FBF6EE]">
                    <thead className="bg-[#0F1F1B] border-b border-[#24463D] sticky top-0 text-[#E0A526]">
                      <tr>
                        <th className="p-2.5">Ingredient Name</th>
                        <th className="p-2.5">Qty / Batch</th>
                        <th className="p-2.5">Unit</th>
                        <th className="p-2.5">Shelf Life (d)</th>
                        <th className="p-2.5">Wastage %</th>
                        <th className="p-2.5">Unit Cost ({restaurant?.currency})</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#24463D]/40 bg-[#142823]">
                      {stagedIngredients.map((ing, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <input
                              type="text"
                              value={ing.name}
                              onChange={(e) => {
                                const copy = [...stagedIngredients];
                                copy[idx].name = e.target.value;
                                setStagedIngredients(copy);
                              }}
                              className="w-full p-1 bg-[#0F1F1B] border border-[#24463D] rounded text-xs text-[#FBF6EE]"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={ing.quantity}
                              onChange={(e) => {
                                const copy = [...stagedIngredients];
                                copy[idx].quantity = parseFloat(e.target.value) || 0;
                                setStagedIngredients(copy);
                              }}
                              className="w-20 p-1 bg-[#0F1F1B] border border-[#24463D] rounded text-xs text-[#FBF6EE]"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={ing.unit}
                              onChange={(e) => {
                                const copy = [...stagedIngredients];
                                copy[idx].unit = e.target.value;
                                setStagedIngredients(copy);
                              }}
                              className="p-1 bg-[#0F1F1B] border border-[#24463D] rounded text-xs text-[#FBF6EE]"
                            >
                              {['g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp', 'cups'].map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              value={ing.shelfLifeDays || 7}
                              onChange={(e) => {
                                const copy = [...stagedIngredients];
                                copy[idx].shelfLifeDays = parseInt(e.target.value) || 7;
                                setStagedIngredients(copy);
                              }}
                              className="w-16 p-1 bg-[#0F1F1B] border border-[#24463D] rounded text-xs text-[#FBF6EE]"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={ing.trimWastePercent || 0}
                              onChange={(e) => {
                                const copy = [...stagedIngredients];
                                copy[idx].trimWastePercent = parseFloat(e.target.value) || 0;
                                setStagedIngredients(copy);
                              }}
                              className="w-16 p-1 bg-[#0F1F1B] border border-[#24463D] rounded text-xs text-[#FBF6EE]"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={ing.costPerUnit || 0}
                              onChange={(e) => {
                                const copy = [...stagedIngredients];
                                copy[idx].costPerUnit = parseFloat(e.target.value) || 0;
                                setStagedIngredients(copy);
                              }}
                              className="w-20 p-1 bg-[#0F1F1B] border border-[#24463D] rounded text-xs text-[#FBF6EE]"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => setStagedIngredients(stagedIngredients.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-300 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Confirm & Save Recipe */}
            <div className="flex items-center justify-between pt-4 border-t border-[#24463D]">
              <span className="text-xs text-[#FBF6EE]/50">
                {stagedIngredients.length} ingredients ready to confirm
              </span>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRecipeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#FBF6EE]/60 hover:text-[#FBF6EE]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRecipe}
                  disabled={savingRecipe || stagedIngredients.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs bg-[#C8553D] hover:bg-[#B54832] disabled:opacity-50 text-[#FBF6EE] shadow"
                >
                  {savingRecipe ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Confirm & Save Recipe</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: VECTOR MATCH & NEAR-DUPLICATE MERGE                 */}
      {/* ============================================================ */}
      {vectorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="max-w-xl w-full my-8 rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-8 text-[#FBF6EE] shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#24463D]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
                  <Merge className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold">Vector Match & Merge</h3>
                  <p className="text-xs text-[#FBF6EE]/60">Resolve shorthand names (&quot;Chk Bir&quot; &rarr; &quot;Chicken Biryani&quot;)</p>
                </div>
              </div>
              <button onClick={() => setVectorModalOpen(false)} className="text-[#FBF6EE]/60 hover:text-[#FBF6EE]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {mergeNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs">
                {mergeNotice}
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[#FBF6EE]/70">
                Unfamiliar / Shorthand Dish Name to Search:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={matchQuery}
                  onChange={(e) => setMatchQuery(e.target.value)}
                  placeholder="e.g. Chk Bir, Dosa Butter, Biryani Mtn"
                  className="flex-1 p-2.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-xs text-[#FBF6EE]"
                />
                <button
                  type="button"
                  onClick={handlePerformVectorMatch}
                  disabled={matching || !matchQuery.trim()}
                  className="px-5 py-2.5 bg-[#2F5D50] hover:bg-[#3D7364] text-xs font-semibold rounded-xl text-[#FBF6EE] flex items-center gap-1.5"
                >
                  {matching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#E0A526]" />}
                  <span>Find Nearest</span>
                </button>
              </div>
            </div>

            {/* Matches list */}
            {matchResults.length > 0 && (
              <div className="space-y-3 pt-2">
                <span className="text-xs font-semibold text-[#E0A526] uppercase tracking-wider block">
                  Top Vector Matches (MODEL_EMBED Cosine Distance)
                </span>

                <div className="divide-y divide-[#24463D]/60 max-h-56 overflow-y-auto">
                  {matchResults.map((m) => (
                    <div key={m.dishId} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-serif font-bold text-sm text-[#FBF6EE] block">
                          {m.dishName}
                        </span>
                        <span className="text-emerald-400 font-mono text-[11px]">
                          Similarity Score: {Math.round(m.similarityScore * 100)}%
                        </span>
                      </div>

                      <button
                        onClick={() => handleMergeDish(m.dishId, m.dishName)}
                        disabled={merging}
                        className="px-4 py-1.5 rounded-lg bg-[#C8553D] hover:bg-[#B54832] font-semibold text-xs text-[#FBF6EE] transition-colors"
                      >
                        Merge Here
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
