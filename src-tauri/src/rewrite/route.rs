#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EngineStep {
    Local,
    Turbo,
    Selected,
}

/// Plan pur et testable du moteur de reformulation. `nova_turbo` représente le
/// mode automatique dans les réglages persistés pour rester compatible avec les
/// installations existantes.
pub fn plan(selected_provider: &str, local_ready: bool, turbo_allowed: bool) -> Vec<EngineStep> {
    if selected_provider == "nova_turbo" {
        let mut steps = Vec::with_capacity(2);
        if local_ready {
            steps.push(EngineStep::Local);
        }
        if turbo_allowed {
            steps.push(EngineStep::Turbo);
        }
        return steps;
    }
    if selected_provider == crate::local_llm::PROVIDER_ID
        || selected_provider == crate::settings::APPLE_INTELLIGENCE_PROVIDER_ID
    {
        return vec![EngineStep::Selected];
    }
    let mut steps = vec![EngineStep::Selected];
    if local_ready {
        steps.push(EngineStep::Local);
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::{plan, EngineStep};

    #[test]
    fn automatic_is_local_first_then_turbo() {
        assert_eq!(
            plan("nova_turbo", true, true),
            vec![EngineStep::Local, EngineStep::Turbo]
        );
    }

    #[test]
    fn depleted_turbo_quota_never_disables_local() {
        assert_eq!(plan("nova_turbo", true, false), vec![EngineStep::Local]);
    }

    #[test]
    fn private_selection_never_adds_cloud_fallback() {
        assert_eq!(
            plan(crate::local_llm::PROVIDER_ID, true, true),
            vec![EngineStep::Selected]
        );
    }
}
