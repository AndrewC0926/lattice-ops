package program_gate

# Policy: Programs in "executing" phase must have a target date and budget allocated.
# This catches data quality regressions in seed/fixture data before they reach production.

deny[msg] {
    input.programs[i].phase == "executing"
    not input.programs[i].target_date
    msg := sprintf("Program '%s' is in executing phase but has no target_date", [input.programs[i].title])
}

deny[msg] {
    input.programs[i].phase == "executing"
    input.programs[i].budget_allocated == 0
    msg := sprintf("Program '%s' is in executing phase but has no budget allocated", [input.programs[i].title])
}

deny[msg] {
    input.programs[i].phase == "executing"
    count(input.programs[i].milestones) == 0
    msg := sprintf("Program '%s' is in executing phase but has no milestones defined", [input.programs[i].title])
}
