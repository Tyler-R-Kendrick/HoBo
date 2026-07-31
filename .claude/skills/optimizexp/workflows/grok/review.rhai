// OptimizeXP persona review loop for Grok Build.
// No iterations flag. Continue until true plateau.

let meta = #{
    name: "optimizexp-review",
    description: "Persona-driven experience review until true plateau"
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

    let baseline = agent(#{
        prompt: `You are the OptimizeXP coordinator.
Read .agents/skills/optimizexp/SKILL.md and references/review-loop.md, agent-bus.md, flags.md.
Init run ${run_id}. There is NO iterations flag and NO pass budget.
Stop only on true plateau (flat scores + zero implementable findings), user, safety, or blocked.
reportOnly=${report_only}.
Use review-loop.mts --mode init --run ${run_id}.
Resolve experiences=${experiences}, personas=${personas}.
Write scope.json and baseline.json with write-ahead bus discipline.
Return JSON: { runId, metric_total, metric_max, personaIds, featureIds, reportOnly }`,
        description: "optimizexp baseline",
        subagent_type: "general-purpose"
    });

    let prior = baseline;
    let iteration = 0;
    // Host runtime guard only (prevents infinite host loops). Agent stops on true plateau.
    let host_guard = 100;

    while iteration < host_guard {
        iteration += 1;
        let step = agent(#{
            prompt: `OptimizeXP persona review+reduce pass ${iteration} for run ${run_id}.
NO iterations flag. Stop only on true plateau / blocked / user / safety.
reportOnly=${report_only}. Prior: ${prior}
1) If pass > 1: MUST read-bus --run ${run_id}; correct expect if wrong.
2) expect → act (capture) → outcome with formal scorecards + comparison.
3) aggregate-bus; write iterations/${iteration}/findings.md + scores.json.
4) REDUCE: unless reportOnly, IMPLEMENT smallest experiment for top finding. Derive-a-fix = ship-it.
5) VERIFY: expect → act → outcome on changed surface.
6) should-stop --iteration ${iteration} --implementable-findings <open_S_M_count>
   (plateau only if scores flat AND open_S_M_count=0).
Return JSON: { metric_total, metric_max, plateau, stop, stopReason, findings_count, implementableFindingsRemaining, experiment }`,
            description: `persona review pass ${iteration}`,
            subagent_type: "general-purpose"
        });
        prior = step;
    }

    agent(#{
        prompt: `Write .optimizexp/runs/${run_id}/summary.md for OptimizeXP.
Include baseline vs final scores, passesCompleted, stop reason (plateau/blocked/user/safety),
experiments applied, remaining debt, evidence index.
Do not invent an iterations budget or pass cap.`,
        description: "optimizexp summary",
        subagent_type: "general-purpose"
    });

    return #{ ok: true, run_id: run_id };
}
