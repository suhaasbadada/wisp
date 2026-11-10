record Workflow {
    present: Bool, current: Bool, status: String, conclusion: String,
    failed_jobs: Int, required_present: Bool, pending_jobs: Int, unsuccessful_jobs: Int
}
record Evidence { trusted_main: Bool, checks: Workflow, pages: Workflow }
record Decision { state: String, reason: String }

fn current_failure(workflow: Workflow) -> Bool {
    workflow.present && workflow.current && workflow.failed_jobs > 0
}

fn decide(evidence: Evidence) -> Decision {
    if !evidence.trusted_main {
        new Decision { state: "Blocked", reason: "untrusted_revision" }
    } else {
        if current_failure(evidence.checks) || current_failure(evidence.pages) {
            new Decision { state: "Blocked", reason: "failed_job" }
        } else {
            if !evidence.checks.present || !evidence.pages.present {
                new Decision { state: "Unknown", reason: "missing_workflow" }
            } else {
                if !evidence.checks.current || !evidence.pages.current {
                    new Decision { state: "Unknown", reason: "stale_workflow" }
                } else {
                    if !evidence.checks.required_present || !evidence.pages.required_present {
                        new Decision { state: "Unknown", reason: "missing_required_job" }
                    } else {
                        if evidence.checks.unsuccessful_jobs > 0 || evidence.pages.unsuccessful_jobs > 0 {
                            new Decision { state: "Blocked", reason: "unsuccessful_required_job" }
                        } else {
                            if evidence.checks.status != "completed" || evidence.pages.status != "completed" || evidence.checks.pending_jobs > 0 || evidence.pages.pending_jobs > 0 {
                                new Decision { state: "Pending", reason: "work_in_progress" }
                            } else {
                                if evidence.checks.conclusion != "success" || evidence.pages.conclusion != "success" {
                                    new Decision { state: "Blocked", reason: "unsuccessful_workflow" }
                                } else {
                                    new Decision { state: "Observed", reason: "workflow_checks_complete" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
