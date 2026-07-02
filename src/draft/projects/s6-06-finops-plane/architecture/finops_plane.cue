package finops_plane

#PlanCostEstimate: {
	schema_version: "hobo.finops.plan-estimate/v1"
	projected_monthly_usd: number & >=0
	currency: "USD"
	line_items: [...#CostLineItem]
	assumptions: [...string]
}

#CostLineItem: {
	resource_id: string & != ""
	dimension: string & != ""
	quantity: number & >0
	unit_price_usd: number & >=0
	line_cost_usd: number & >=0
}

#FinOpsDeployGateDecision: {
	effect: "allow" | "deny" | "allow-degraded"
	reason: string
	cost_estimate_usd: number & >=0
}

#ShowbackReconciliation: {
	schema_version: "hobo.finops.showback-reconcile/v1"
	metering_total_usd: number & >=0
	showback_total_usd: number & >=0
	reconciled: bool
}
