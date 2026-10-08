type PlanLike = { id: string };

export function visiblePlanId(plans: readonly PlanLike[], selectedPlanId: string): string {
  if (plans.some((plan) => plan.id === selectedPlanId)) return selectedPlanId;
  return plans[0]?.id ?? '';
}
