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

static PERCENTAGES: Lazy<Vec<CanonicalTerm>> = Lazy::new(|| {
    [
        (
            r"(?iu)\b(?:zéro|zero|zero)\s+(?:pour\s+cent|percent)\b",
            "0 %",
        ),
        (r"(?iu)\b(?:un|une|one)\s+(?:pour\s+cent|percent)\b", "1 %"),
        (r"(?iu)\b(?:deux|two)\s+(?:pour\s+cent|percent)\b", "2 %"),
        (r"(?iu)\b(?:trois|three)\s+(?:pour\s+cent|percent)\b", "3 %"),
        (r"(?iu)\b(?:quatre|four)\s+(?:pour\s+cent|percent)\b", "4 %"),
        (r"(?iu)\b(?:cinq|five)\s+(?:pour\s+cent|percent)\b", "5 %"),
        (r"(?iu)\b(?:six)\s+(?:pour\s+cent|percent)\b", "6 %"),
        (r"(?iu)\b(?:sept|seven)\s+(?:pour\s+cent|percent)\b", "7 %"),
        (r"(?iu)\b(?:huit|eight)\s+(?:pour\s+cent|percent)\b", "8 %"),
        (r"(?iu)\b(?:neuf|nine)\s+(?:pour\s+cent|percent)\b", "9 %"),
        (r"(?iu)\b(?:dix|ten)\s+(?:pour\s+cent|percent)\b", "10 %"),
        (
            r"(?iu)\b(?:onze|eleven)\s+(?:pour\s+cent|percent)\b",
            "11 %",
        ),
        (
            r"(?iu)\b(?:douze|twelve)\s+(?:pour\s+cent|percent)\b",
            "12 %",
        ),
        (
            r"(?iu)\b(?:treize|thirteen)\s+(?:pour\s+cent|percent)\b",
            "13 %",
        ),
        (
            r"(?iu)\b(?:quatorze|fourteen)\s+(?:pour\s+cent|percent)\b",
            "14 %",
        ),
        (
            r"(?iu)\b(?:quinze|fifteen)\s+(?:pour\s+cent|percent)\b",
            "15 %",
        ),
        (
            r"(?iu)\b(?:seize|sixteen)\s+(?:pour\s+cent|percent)\b",
            "16 %",
        ),
        (
            r"(?iu)\b(?:dix[\s-]+sept|seventeen)\s+(?:pour\s+cent|percent)\b",
            "17 %",
        ),
        (
            r"(?iu)\b(?:dix[\s-]+huit|eighteen)\s+(?:pour\s+cent|percent)\b",
            "18 %",
        ),
        (
            r"(?iu)\b(?:dix[\s-]+neuf|nineteen)\s+(?:pour\s+cent|percent)\b",
            "19 %",
        ),
        (
            r"(?iu)\b(?:vingt|twenty)\s+(?:pour\s+cent|percent)\b",
            "20 %",
        ),
        (
            r"(?iu)\b(\d+(?:[.,]\d+)?)\s*(?:pour\s+cent|percent|%)",
            "$1 %",
        ),
    ]
    .into_iter()
    .map(|(pattern, replacement)| CanonicalTerm {
        pattern: Regex::new(pattern).expect("percentage pattern"),
        replacement,
    })
    .collect()
});

/// Normalisation déterministe des confusions phonétiques les plus fréquentes.
/// Elle précède le LLM : le résultat ne dépend donc ni du profil local, ni du
/// fournisseur Turbo. Les motifs restent volontairement conservateurs.
pub fn normalize(text: &str) -> String {
    let normalized = TERMS.iter().fold(text.to_string(), |current, term| {
        term.pattern
            .replace_all(&current, term.replacement)
            .into_owned()
    });
    PERCENTAGES.iter().fold(normalized, |current, term| {
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

    #[test]
    fn normalizes_spoken_percentages_in_french_and_english() {
        assert_eq!(normalize("dix pour cent et 12%"), "10 % et 12 %");
        assert_eq!(normalize("twenty percent"), "20 %");
    }
}
