import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  normalizeBudget,
  createDefaultBudget,
  type DealBudget,
} from "@shared/budgetTemplate";

function budgetKey(dealId: number) {
  return ["/api/deals", dealId, "budget"] as const;
}

/**
 * Load + persist a deal's Walkthrough Budget.
 *
 * `save` writes the full budget JSON via PUT. Callers should debounce their own
 * calls (the modal debounces ~500ms) so we don't write on every keystroke.
 */
export function useDealBudget(dealId: number) {
  const enabled = Number.isFinite(dealId);

  const query = useQuery<DealBudget>({
    queryKey: budgetKey(dealId),
    enabled,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/deals/${dealId}/budget`);
      return normalizeBudget(await res.json());
    },
  });

  const mutation = useMutation({
    mutationFn: async (budget: DealBudget) => {
      const res = await apiRequest("PUT", `/api/deals/${dealId}/budget`, budget);
      return normalizeBudget(await res.json());
    },
    onSuccess: (saved) => {
      // Keep the cache in sync without a refetch round-trip.
      queryClient.setQueryData(budgetKey(dealId), saved);
    },
  });

  return {
    budget: query.data ?? createDefaultBudget(),
    isLoading: query.isLoading,
    save: (budget: DealBudget) => mutation.mutate(budget),
    isSaving: mutation.isPending,
  };
}
