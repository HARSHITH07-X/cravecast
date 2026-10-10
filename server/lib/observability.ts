import { EventEmitter } from 'events';
import type { FirestoreClient } from './firestoreRest.js';

export interface TokenCounts {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

export interface AgentRunStep {
  id: string;
  runId: string;
  restaurantId: string;
  agent: string;
  step: string;
  input: any;
  output: any;
  latencyMs: number;
  tokenCounts: TokenCounts;
  model: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; args: any; result?: any }>;
}

class AgentObservabilityService extends EventEmitter {
  private inMemorySteps: AgentRunStep[] = [];
  private maxInMemory: number = 200;

  /**
   * Records an agent step, emits it for live SSE streaming, and persists if db provided.
   */
  async recordStep(
    stepData: Omit<AgentRunStep, 'id' | 'timestamp'>,
    db?: FirestoreClient
  ): Promise<AgentRunStep> {
    const id = `step_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const fullStep: AgentRunStep = {
      ...stepData,
      id,
      timestamp,
      tokenCounts: stepData.tokenCounts || { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
    };

    // Keep ring buffer in memory
    this.inMemorySteps.unshift(fullStep);
    if (this.inMemorySteps.length > this.maxInMemory) {
      this.inMemorySteps.pop();
    }

    // Emit live event for streaming
    this.emit('step', fullStep);
    this.emit(`run:${fullStep.runId}`, fullStep);
    if (fullStep.restaurantId) {
      this.emit(`restaurant:${fullStep.restaurantId}`, fullStep);
    }

    // Optional firestore persistence
    if (db && fullStep.restaurantId) {
      try {
        await db
          .collection(`restaurants/${fullStep.restaurantId}/agent_runs`)
          .doc(id)
          .set(fullStep);
      } catch (err) {
        // Log without crashing in-memory flow
        console.warn('Could not persist agent step to Firestore:', err);
      }
    }

    return fullStep;
  }

  /**
   * Retrieves recorded steps filtered by restaurant or runId.
   */
  getSteps(restaurantId?: string, runId?: string): AgentRunStep[] {
    return this.inMemorySteps.filter((s) => {
      if (restaurantId && s.restaurantId !== restaurantId) return false;
      if (runId && s.runId !== runId) return false;
      return true;
    });
  }

  /**
   * Retrieves steps from memory and merges with persisted Firestore agent_runs if available.
   */
  async listStepsWithDb(
    restaurantId: string,
    runId?: string,
    db?: FirestoreClient
  ): Promise<AgentRunStep[]> {
    const memorySteps = this.getSteps(restaurantId, runId);
    if (!db) return memorySteps;

    try {
      const snap = await db
        .collection(`restaurants/${restaurantId}/agent_runs`)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

      const dbSteps = snap.docs.map((d: any) => d.data() as AgentRunStep);
      const seenIds = new Set(memorySteps.map((s) => s.id));
      const merged = [...memorySteps];

      for (const s of dbSteps) {
        if (s && s.id && !seenIds.has(s.id)) {
          if (!runId || s.runId === runId) {
            seenIds.add(s.id);
            merged.push(s);
          }
        }
      }

      merged.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return merged.slice(0, 100);
    } catch {
      return memorySteps;
    }
  }

  /**
   * Clears in-memory steps (useful in testing)
   */
  clear() {
    this.inMemorySteps = [];
  }
}

export const agentObservability = new AgentObservabilityService();
