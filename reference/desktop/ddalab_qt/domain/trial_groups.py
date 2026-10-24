"""Condition-labelled trial CSV contract; grouping never averages waveforms."""
import re

_COLUMN = re.compile(r"^(E[0-9]+|AVG_E[0-9]+(?:_E[0-9]+)*)__([A-Za-z][A-Za-z0-9_-]*)__trial_([A-Za-z0-9_-]+)$")


def trial_groups(names, selected_indices=None):
    """Return [] for legacy files; reject incomplete or ambiguous grouped files."""
    if not any("__" in name for name in names):
        return []
    matches = [_COLUMN.fullmatch(name) for name in names]
    if not all(matches):
        raise ValueError("Every trial column must use Electrode__condition__trial_eventID, for example E129__exp1__trial_event000001 or AVG_E129_E36_E104__exp1__trial_event000001.")
    if len(set(names)) != len(names):
        raise ValueError("Duplicate trial column names are not allowed.")
    if len({m[1] for m in matches}) != 1:
        raise ValueError("A combined condition file must contain one electrode (or one defined electrode average) only.")
    if len({m[3] for m in matches}) != len(matches):
        raise ValueError("An event may occur only once in a combined condition file.")
    indices = list(range(len(names))) if selected_indices is None else list(selected_indices)
    if len(set(indices)) != len(indices) or any(i < 0 or i >= len(names) for i in indices):
        raise ValueError("Invalid or duplicate selected trial indices.")
    selected = set(indices)
    groups = {}
    for i, match in enumerate(matches):
        if i not in selected:
            continue
        electrode, condition, event = match.groups()
        group = groups.setdefault(condition, dict(electrode=electrode, condition=condition,
            channel_indices=[], channel_names=[], event_ids=[]))
        group["channel_indices"].append(i)
        group["channel_names"].append(names[i])
        group["event_ids"].append(event)
    return list(groups.values())
