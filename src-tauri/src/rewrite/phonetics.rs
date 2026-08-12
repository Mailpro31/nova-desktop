use once_cell::sync::Lazy;
use regex::Regex;

struct CanonicalTerm {
    pattern: Regex,
    replacement: &'static str,
}

static TERMS: Lazy<Vec<CanonicalTerm>> = Lazy::new(|| {
    [
        (r"(?iu)\bripo\s+(?:git\s*hub|github)\b", "repo GitHub"),
        (r"(?iu)\brepo\s+git\s*hub\b", "repo GitHub"),
        (r"(?iu)\bgit[\s-]+hub\b", "GitHub"),
        (r"(?iu)\bi[\s-]*b[\s-]*a[\s-]*n\b", "IBAN"),
        (r"(?iu)\ba[\s-]+p[\s-]+i\b", "API"),
        (r"(?iu)\bg[\s-]+p[\s-]+u\b", "GPU"),
        (r"(?iu)\bc[\s-]+p[\s-]+u\b", "CPU"),
        (r"(?iu)\bwi[\s-]*fi\b", "Wi-Fi"),
    ]
    .into_iter()
    .map(|(pattern, replacement)| CanonicalTerm {
        pattern: Regex::new(pattern).expect("canonical phonetic pattern"),
        replacement,
    })
    .collect()
});

/// Normalisation déterministe des confusions phonétiques les plus fréquentes.
/// Elle précède le LLM : le résultat ne dépend donc ni du profil local, ni du
/// fournisseur Turbo. Les motifs restent volontairement conservateurs.
pub fn normalize(text: &str) -> String {
    TERMS.iter().fold(text.to_string(), |current, term| {
        term.pattern
            .replace_all(&current, term.replacement)
            .into_owned()
    })
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn normalizes_common_spoken_technical_terms() {
        assert_eq!(normalize("ouvre le ripo git hub"), "ouvre le repo GitHub");
        assert_eq!(normalize("mon i-ban et mon a p i"), "mon IBAN et mon API");
        assert_eq!(normalize("le g p u aide le c p u"), "le GPU aide le CPU");
    }

    #[test]
    fn leaves_unrelated_words_untouched() {
        assert_eq!(
            normalize("un repos agréable à Ibiza"),
            "un repos agréable à Ibiza"
        );
    }
}
