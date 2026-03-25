package ai_output

import future.keywords.in

# Policy: AI analysis records must always include the evidenceMissing field.
# Guards against prompt drift where the anti-fabrication flag gets lost.

deny[msg] {
    analysis := input.ai_analyses[_]
    not has_field(analysis.output_data, "evidenceMissing")
    msg := sprintf("AI analysis '%s' is missing required 'evidenceMissing' field", [analysis.capability])
}

# Policy: AI outputs must not contain fabricated future dates beyond 2 years from now.
# Prevents hallucinated timelines from entering the decision pipeline.

deny[msg] {
    analysis := input.ai_analyses[_]
    date_str := find_dates(analysis.output_data)[_]
    time.parse_rfc3339_ns(date_str) > time.add_date(time.now_ns(), 2, 0, 0)
    msg := sprintf("AI analysis '%s' contains a fabricated date more than 2 years in the future: %s", [analysis.capability, date_str])
}

# Helper: check if an object has a given field
has_field(obj, field) {
    _ = obj[field]
}

# Helper: extract ISO date strings from nested JSON
# This is a simplified extractor — matches strings that look like ISO dates
find_dates(obj) = dates {
    dates := [val | walk(obj, [_, val]); is_string(val); regex.match(`^\d{4}-\d{2}-\d{2}`, val)]
}
