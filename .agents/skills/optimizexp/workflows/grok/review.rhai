// OptimizeXP persona review loop for Grok Build.
// Outer --passes completion cycles (default 1). No review-iteration budget.

let meta = #{
    name: "optimizexp-review",
    description: "Persona-driven experience review; --passes outer cycles to true plateau each"
};

fn run(args) {
    let run_id = args["run_id"];
    if run_id == () {
        run_id = "manual";
    }
    let experiences = args["experiences"];
    if experiences == () {
        experiences = "ux,dx,ax";
    }
    let personas = args["personas"];
    if personas == () {
        personas = "auto";
    }
    let report_only = args["report_only"];
    if report_only == () {
        report_only = false;
    }
    let passes = args["passes"];
    if passes == () {
        passes = "infinite";
    }

    let baseline = agent(#{
        prompt: `You are the OptimizeXP coordinator.
Read .agents/skills/optimizexp/SKILL.md and references/review-loop.md, agent-bus.md, flags.md.
Init run ${run_id} with --passes ${passes}.
Outer cycles default infinite: each cycle to true plateau; then re-survey.
Stop invocation when metrics all 0 OR irreducible (no new S/M findings after re-survey).
Finite --passes N only caps max outer cycles.
NO review-iteration budget inside a cycle.
Stop a cycle only on true plateau (flat scores + zero implementable findings), user, safety, or blocked.
reportOnly=${report_only}.
Use review-loop.mts --mode init --run ${run_id} --passes ${passes}.
Resolve experiences=${experiences}, personas=${personas}.
Write scope.json (passes, passesLabel, cyclesCompleted) and baseline.json.
Return JSON: { runId, passes, metric_total, metric_max, personaIds, featureIds, reportOnly }`,
        description: "optimizexp baseline",
        subagent_type: "general-purpose"
    });

    let prior = baseline;
    let iteration = 0;
    // Host runtime guard only (prevents infinite host loops). Agent owns plateau + outer cycles.
    let host_guard = 100;

    while iteration < host_guard {
        iteration += 1;
        let step = agent(#{
            prompt: `OptimizeXP review+reduce iteration ${iteration} for run ${run_id} (outer passes=${passes}).
NO review-iteration budget. Each outer cycle ends only on true plateau / blocked / user / safety.
After cycle plateau: if metric_total=0 and metric_max=0 → stop (metrics-zero).
Else re-survey; if no new S/M findings → stop (irreducible). Else if infinite or under finite cap → next cycle.
reportOnly=${report_only}. Prior: ${prior}
1) If not first iteration of a cycle: MUST read-bus --run ${run_id}; correct expect if wrong.
2) expect → act (capture) → outcome with formal scorecards + comparison.
3) aggregate-bus; write iterations/${iteration}/findings.md + scores.json.
4) REDUCE: unless reportOnly, IMPLEMENT smallest experiment for top finding. Derive-a-fix = ship-it.
5) VERIFY: expect → act → outcome on changed surface.
6) should-stop --iteration ${iteration} --implementable-findings <open_S_M_count>
   (plateau only if scores flat AND open_S_M_count=0).
7) Update scope.json cyclesCompleted / passesCompleted / stopReason.
Return JSON: { metric_total, metric_max, plateau, stop, stopReason, findings_count, implementableFindingsRemaining, experiment, cyclesCompleted, passes }`,
            description: `persona review ${iteration}`,
            subagent_type: "general-purpose"
        });
        prior = step;
    }

    agent(#{
        prompt: `Write .optimizexp/runs/${run_id}/summary.md for OptimizeXP.
Include baseline vs final scores, passes/passesLabel, cyclesCompleted, review iterations,
stop reason (metrics-zero|irreducible|passes-cap|blocked|user|safety), experiments, residual debt, evidence.
Outer --passes default infinite until metrics=0 or irreducible; finite N is only a cap.`,
        description: "optimizexp summary",
        subagent_type: "general-purpose"
    });

    return #{ ok: true, run_id: run_id, passes: passes };
}
