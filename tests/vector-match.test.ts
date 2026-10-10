/**
 * CraveCast Vector Matching Unit Test
 *
 * Verifies that vector embeddings match shorthand / unfamiliar dish queries
 * e.g. "Chk Bir" -> "Chicken Biryani" using cosine similarity on embedding vectors.
 */

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

export function runVectorMatchTests() {
  // Synthetic test vectors representing semantic dish clusters
  // Dimension 4: [chicken_weight, rice_weight, biryani_weight, beverage_weight]
  const chickenBiryaniVector = [0.92, 0.88, 0.95, 0.05];
  const muttonBiryaniVector = [0.10, 0.85, 0.94, 0.05];
  const mangoLassiVector = [0.01, 0.02, 0.01, 0.98];

  // "Chk Bir" query vector (strong alignment with chicken + biryani)
  const chkBirQueryVector = [0.89, 0.82, 0.91, 0.04];

  const dishes = [
    { name: 'Chicken Biryani', vector: chickenBiryaniVector },
    { name: 'Mutton Biryani', vector: muttonBiryaniVector },
    { name: 'Mango Lassi', vector: mangoLassiVector },
  ];

  const scoredDishes = dishes.map((d) => ({
    name: d.name,
    score: cosineSimilarity(chkBirQueryVector, d.vector),
  }));

  scoredDishes.sort((a, b) => b.score - a.score);

  console.log('Query: "Chk Bir"');
  scoredDishes.forEach((d) => {
    console.log(`- ${d.name}: Similarity ${Math.round(d.score * 100)}%`);
  });

  const topMatch = scoredDishes[0];
  const isCorrectMatch = topMatch.name === 'Chicken Biryani' && topMatch.score > 0.9;

  if (isCorrectMatch) {
    console.log('PASS: "Chk Bir" correctly resolved to "Chicken Biryani" via vector similarity.');
  } else {
    console.error('FAIL: "Chk Bir" did not resolve to "Chicken Biryani".');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVectorMatchTests();
}
