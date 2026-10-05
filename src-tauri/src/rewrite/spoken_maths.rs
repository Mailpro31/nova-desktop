//! Les formules dictées, écrites en symboles.
//!
//! « Formule, delta égale b au carré moins quatre a c » devient
//! « Δ = b² − 4ac ». Les règles sont fixes : pas de modèle, donc rien
//! d'inventé, et le même résultat hors ligne. Elles ne s'appliquent qu'au
//! contenu d'un bloc « Formule » (`spoken_marks`) : ailleurs, « plus »,
//! « moins » ou « sur » restent des mots.
//!
//! Le texte rendu est de l'Unicode simple (², √, Δ, ≤), lisible partout où
//! Nova colle : Word, OneNote, un ENT, un e-mail.

use once_cell::sync::Lazy;
use regex::{Captures, Regex};

/// `(motif, symbole)`, appliqués dans l'ordre : les expressions longues
/// d'abord (« inférieur ou égal à » avant « inférieur à », « grand delta »
/// avant « delta »).
const PHRASES: &[(&str, &str)] = &[
    // Comparaisons dites « plus petit que », avant « plus ».
    (r"(?:est\s+)?plus\s+petite?\s+ou\s+égale?\s+à", " ≤ "),
    (r"(?:est\s+)?plus\s+grande?\s+ou\s+égale?\s+à", " ≥ "),
    (r"(?:est\s+)?plus\s+petite?\s+que", " < "),
    (r"(?:est\s+)?plus\s+grande?\s+que", " > "),
    (r"un\s+demi", " 1/2 "),
    // Comparaisons.
    (
        r"est\s+inférieure?\s+ou\s+égale?\s+à|inférieure?\s+ou\s+égale?\s+à",
        " ≤ ",
    ),
    (
        r"est\s+supérieure?\s+ou\s+égale?\s+à|supérieure?\s+ou\s+égale?\s+à",
        " ≥ ",
    ),
    (
        r"est\s+strictement\s+inférieure?\s+à|strictement\s+inférieure?\s+à",
        " < ",
    ),
    (
        r"est\s+strictement\s+supérieure?\s+à|strictement\s+supérieure?\s+à",
        " > ",
    ),
    (r"est\s+inférieure?\s+à|inférieure?\s+à", " < "),
    (r"est\s+supérieure?\s+à|supérieure?\s+à", " > "),
    (
        r"(?:est\s+)?environ\s+égale?\s+à|(?:est\s+)?à\s+peu\s+près\s+égale?\s+à",
        " ≈ ",
    ),
    (r"(?:est\s+)?différente?\s+de", " ≠ "),
    (r"est\s+égale?\s+à|égale?\s+à|égalent|égale|égal", " = "),
    (r"tend\s+vers", " → "),
    (r"appartient\s+à", " ∈ "),
    (r"pour\s+tout", "∀ "),
    (r"il\s+existe", "∃ "),
    // Opérations.
    (r"plus\s+ou\s+moins", " ± "),
    (r"multiplié\s+par|fois", " × "),
    (r"divisé\s+par|sur", " / "),
    (r"plus", " + "),
    (r"moins", " − "),
    (r"racine\s+carrée\s+de|racine\s+carrée|racine\s+de", " √"),
    (r"intégrale\s+de|intégrale", " ∫ "),
    (r"dérivée\s+partielle\s+de|d\s+rond", " ∂"),
    (r"(?:l['’]\s*)?infini", "∞"),
    (
        r"ouvrez\s+la\s+parenthèse|ouvre\s+la\s+parenthèse|parenthèse\s+ouvrante",
        " (",
    ),
    (
        r"fermez\s+la\s+parenthèse|ferme\s+la\s+parenthèse|parenthèse\s+fermante",
        ") ",
    ),
    // Lettres grecques. En cours, « delta » est presque toujours la
    // majuscule : le discriminant, une variation (Δt).
    (r"petit\s+delta", "δ"),
    (r"grand\s+delta|delta", "Δ"),
    (r"grand\s+sigma", "Σ"),
    (r"sigma", "σ"),
    (r"grand\s+oméga|grand\s+omega", "Ω"),
    (r"oméga|omega", "ω"),
    (r"grand\s+phi", "Φ"),
    (r"phi", "φ"),
    (r"grand\s+gamma", "Γ"),
    (r"gamma", "γ"),
    (r"grand\s+lambda", "Λ"),
    (r"lambda", "λ"),
    (r"alpha", "α"),
    (r"bêta|beta", "β"),
    (r"epsilon", "ε"),
    (r"thêta|theta", "θ"),
    (r"mu", "μ"),
    (r"pi", "π"),
    (r"rho", "ρ"),
    (r"tau", "τ"),
    // Unités composées, avant les unités simples.
    (r"mètres?\s+par\s+seconde\s+au\s+carré", " m/s² "),
    (r"mètres?\s+par\s+seconde", " m/s "),
    (
        r"kilomètres?\s+par\s+heure|kilomètres?[\s-]+heure",
        " km/h ",
    ),
    (r"degrés?\s+celsius", " °C "),
];

/// Les unités simples, seulement juste après un nombre : « 3 mètres » donne
/// « 3 m », mais « le mètre étalon » reste un mot.
const UNITS: &[(&str, &str)] = &[
    (r"kilogrammes?", "kg"),
    (r"grammes?", "g"),
    (r"kilomètres?", "km"),
    (r"centimètres?", "cm"),
    (r"millimètres?", "mm"),
    (r"mètres?\s+carrés?", "m²"),
    (r"mètres?\s+cubes?", "m³"),
    (r"mètres?", "m"),
    (r"secondes?", "s"),
    (r"newtons?", "N"),
    (r"joules?", "J"),
    (r"watts?", "W"),
    (r"pascals?", "Pa"),
    (r"volts?", "V"),
    (r"ampères?", "A"),
    (r"ohms?", "Ω"),
    (r"hertz", "Hz"),
    (r"kelvins?", "K"),
    (r"moles?", "mol"),
];

const NUMBER_WORDS: &[(&str, &str)] = &[
    ("zéro", "0"),
    ("un", "1"),
    ("une", "1"),
    ("deux", "2"),
    ("trois", "3"),
    ("quatre", "4"),
    ("cinq", "5"),
    ("six", "6"),
    ("sept", "7"),
    ("huit", "8"),
    ("neuf", "9"),
    ("dix", "10"),
];

struct Rule {
    pattern: Regex,
    symbol: &'static str,
}

fn word_rule(pattern: &str, symbol: &'static str) -> Rule {
    Rule {
        pattern: Regex::new(&format!(r"(?iu)\b(?:{pattern})\b")).expect("formula pattern"),
        symbol,
    }
}

static PHRASE_RULES: Lazy<Vec<Rule>> = Lazy::new(|| {
    PHRASES
        .iter()
        .map(|(pattern, symbol)| word_rule(pattern, symbol))
        .collect()
});

static UNIT_RULES: Lazy<Vec<Rule>> = Lazy::new(|| {
    UNITS
        .iter()
        .map(|(pattern, symbol)| Rule {
            pattern: Regex::new(&format!(r"(?iu)(\d)\s*(?:{pattern})\b")).expect("unit pattern"),
            symbol,
        })
        .collect()
});

static NUMBER_RULES: Lazy<Vec<Rule>> = Lazy::new(|| {
    NUMBER_WORDS
        .iter()
        .map(|(word, digit)| word_rule(word, digit))
        .collect()
});

/// « x au carré », « au cube », « puissance 3 », « puissance moins un ».
static SQUARED: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?iu)\s*\bau\s+carré\b").expect("squared"));
static CUBED: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?iu)\s*\bau\s+cube\b").expect("cubed"));
static POWER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?u)\s*\b(?i:puissance|exposant)\s+(−\s*|-\s*|moins\s+)?(\d+|[abikmnptxy])\b")
        .expect("power")
});
static INDEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?iu)\s*\bindice\s+(\d+|[ijn])\b").expect("index"));
/// « 3 virgule 5 » : la virgule décimale française.
static DECIMAL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?iu)(\d)\s+virgule\s+(\d)").expect("decimal"));
/// « f de x » : f(x). Seulement les lettres de fonction usuelles.
static FUNCTION_OF: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b([fghuv])\s+de\s+([a-zα-ω]|\d+)\b").expect("function of"));
static DEGREES: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?iu)(\d)\s*\bdegrés?\b").expect("degrees"));
static SPACES: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ \t]+").expect("spaces"));

/// Une formule dictée, écrite en symboles.
pub fn to_symbols(text: &str) -> String {
    let mut out = text.to_string();
    for rule in PHRASE_RULES.iter() {
        out = rule.pattern.replace_all(&out, rule.symbol).into_owned();
    }
    for rule in NUMBER_RULES.iter() {
        out = rule
            .pattern
            .replace_all(&out, |caps: &Captures| {
                let whole = caps.get(0).expect("match");
                // « d'un ressort » : un article, pas le nombre 1.
                let elided = out[..whole.start()].ends_with(['\'', '’']);
                let compound =
                    out[whole.end()..].starts_with('-') || out[..whole.start()].ends_with('-');
                if elided || compound {
                    whole.as_str().to_string()
                } else {
                    rule.symbol.to_string()
                }
            })
            .into_owned();
    }
    out = FUNCTION_OF.replace_all(&out, "$1($2)").into_owned();
    // Après les nombres dits en lettres : « trois virgule cinq ».
    out = DECIMAL.replace_all(&out, "$1,$2").into_owned();
    out = DEGREES.replace_all(&out, "$1°").into_owned();
    out = SQUARED.replace_all(&out, "²").into_owned();
    out = CUBED.replace_all(&out, "³").into_owned();
    out = POWER
        .replace_all(&out, |caps: &Captures| {
            let minus = if caps.get(1).is_some() { "⁻" } else { "" };
            format!("{minus}{}", superscript(&caps[2]))
        })
        .into_owned();
    out = INDEX
        .replace_all(&out, |caps: &Captures| subscript(&caps[1]))
        .into_owned();
    out = with_units(&out);
    tidy(&out)
}

/// Les unités simples juste après un nombre, séparées par une espace
/// insécable, comme le veut la typographie : « 12 N » ne se colle jamais en
/// « 12N ».
fn with_units(text: &str) -> String {
    let mut out = text.to_string();
    for rule in UNIT_RULES.iter() {
        out = rule
            .pattern
            .replace_all(&out, |caps: &Captures| {
                format!("{}\u{a0}{}", &caps[1], rule.symbol)
            })
            .into_owned();
    }
    out
}

fn superscript(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '0' => '⁰',
            '1' => '¹',
            '2' => '²',
            '3' => '³',
            '4' => '⁴',
            '5' => '⁵',
            '6' => '⁶',
            '7' => '⁷',
            '8' => '⁸',
            '9' => '⁹',
            'n' | 'N' => 'ⁿ',
            'x' => 'ˣ',
            'a' => 'ᵃ',
            'b' => 'ᵇ',
            'i' => 'ⁱ',
            'k' => 'ᵏ',
            'm' => 'ᵐ',
            'p' => 'ᵖ',
            't' => 'ᵗ',
            'y' => 'ʸ',
            other => other,
        })
        .collect()
}

fn subscript(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '0' => '₀',
            '1' => '₁',
            '2' => '₂',
            '3' => '₃',
            '4' => '₄',
            '5' => '₅',
            '6' => '₆',
            '7' => '₇',
            '8' => '₈',
            '9' => '₉',
            'i' | 'I' => 'ᵢ',
            'j' | 'J' => 'ⱼ',
            'n' | 'N' => 'ₙ',
            other => other,
        })
        .collect()
}

const POWERS: &str = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁻₀₁₂₃₄₅₆₇₈₉ᵢⱼₙˣᵃᵇⁱᵏᵐᵖᵗʸ";

const OPERATORS: &[&str] = &[
    "=", "<", ">", "≤", "≥", "≈", "≠", "→", "×", "/", "±", "∈", "(", "+", "−",
];

fn is_number(token: &str) -> bool {
    let token = token.trim_end_matches(['.', ',', ';', ':', '!', '?']);
    !token.is_empty() && token.chars().all(|c| c.is_ascii_digit() || c == ',')
}

/// Un nombre, une lettre seule (latine ou grecque) ou un symbole qui
/// s'écrit collé (∞), avec ses exposants et indices.
fn is_atom(token: &str) -> bool {
    // La ponctuation de fin de phrase ne compte pas : « c. » reste un « c ».
    let token = token.trim_end_matches(['.', ',', ';', ':', '!', '?']);
    let core: String = token.chars().filter(|c| !POWERS.contains(*c)).collect();
    if core.is_empty() {
        return false;
    }
    let is_number = core.chars().all(|c| c.is_ascii_digit() || c == ',')
        && core.chars().next().is_some_and(|c| c.is_ascii_digit());
    let mut letters = core.chars();
    let is_letter = letters
        .next()
        .is_some_and(|c| (c.is_alphabetic() && !matches!(c, 'à' | 'À')) || c == '∞')
        && letters.next().is_none();
    is_number || is_letter
}

/// Les espaces d'une formule : « 4 a c » s'écrit « 4ac », « √ x » s'écrit
/// « √x », « ( x + 1 ) » s'écrit « (x + 1) », « a / b » s'écrit « a/b ».
fn tidy(text: &str) -> String {
    let spaced = SPACES.replace_all(text.trim(), " ");
    let tokens: Vec<&str> = spaced
        .split(' ')
        .filter(|token| !token.is_empty())
        .collect();
    let mut out = String::new();
    let mut previous: Option<&str> = None;
    let mut before_previous: Option<&str> = None;
    for token in tokens {
        if let Some(before) = previous {
            // « x = − 3 » : un signe en tête ou après un opérateur est unaire.
            let unary_sign = matches!(before, "−" | "+")
                && before_previous.is_none_or(|op| OPERATORS.contains(&op));
            // « 2. y » : une fin de phrase ou une virgule de liste sépare.
            let ends_clause = before.ends_with(['.', ',', ';', ':', '!', '?']);
            let glued = (is_atom(before)
                && is_atom(token)
                && !ends_clause
                && !(is_number(before) && is_number(token)))
                || unary_sign
                || before.ends_with(['√', '(', '∂'])
                || token.starts_with([')', ',', '.'])
                || before == "/"
                || token == "/"
                || (is_atom(before) && token.starts_with('('));
            if !glued {
                out.push(' ');
            }
        }
        out.push_str(token);
        before_previous = previous;
        previous = Some(token);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::to_symbols;

    /// Cas trouvés par la chasse aux bugs du 05/10, sur des dictées réelles.
    #[test]
    fn bug_hunt_cases_stay_fixed() {
        for (said, written) in [
            ("x tend vers plus l'infini", "x → +∞"),
            ("x tend vers moins l’infini", "x → −∞"),
            ("g égale neuf virgule huit", "g = 9,8"),
            ("x plus petit que 3", "x < 3"),
            ("x plus grand ou égal à 3", "x ≥ 3"),
            (
                "l'énergie d'un ressort égale un demi k x au carré",
                "l'énergie d'un ressort = 1/2 kx²",
            ),
            ("e puissance moins x", "e⁻ˣ"),
            ("P de degré 3", "P de degré 3"),
            ("angle égale 30 degrés", "angle = 30°"),
            ("les points 2 3", "les points 2 3"),
            ("x égale moins 3", "x = −3"),
            ("moins b sur 2 a", "−b/2a"),
            ("x égale 2. y égale 3.", "x = 2. y = 3."),
            ("intégrale de 0 à 1 de f de x d x", "∫ 0 à 1 de f(x) dx"),
            ("x égale dix-sept", "x = dix-sept"),
            ("a, b et c", "a, b et c"),
        ] {
            assert_eq!(to_symbols(said), written, "{said}");
        }
    }

    #[test]
    fn a_discriminant_is_written_in_symbols() {
        assert_eq!(
            to_symbols("delta égale b au carré moins quatre a c"),
            "Δ = b² − 4ac"
        );
    }

    #[test]
    fn powers_roots_and_fractions() {
        assert_eq!(to_symbols("x au carré plus 2 x plus 1"), "x² + 2x + 1");
        assert_eq!(to_symbols("racine carrée de x sur 2"), "√x/2");
        assert_eq!(to_symbols("e puissance moins 1"), "e⁻¹");
        assert_eq!(to_symbols("x puissance n"), "xⁿ");
        assert_eq!(to_symbols("u indice n plus 1"), "uₙ + 1");
        assert_eq!(
            to_symbols("a fois ouvrez la parenthèse x plus 1 fermez la parenthèse"),
            "a × (x + 1)"
        );
    }

    #[test]
    fn comparisons_and_greek_letters() {
        assert_eq!(to_symbols("x inférieur ou égal à pi"), "x ≤ π");
        assert_eq!(to_symbols("alpha différent de bêta"), "α ≠ β");
        assert_eq!(to_symbols("grand oméga égale 2 pi f"), "Ω = 2πf");
        assert_eq!(to_symbols("x tend vers infini"), "x → ∞");
        assert_eq!(to_symbols("x puissance deux"), "x²");
    }

    #[test]
    fn units_follow_numbers() {
        assert_eq!(to_symbols("v égale 3 mètres par seconde"), "v = 3 m/s");
        assert_eq!(
            to_symbols("a égale 9 virgule 81 mètres par seconde au carré"),
            "a = 9,81 m/s²"
        );
        assert_eq!(to_symbols("F égale 12 newtons"), "F = 12\u{a0}N");
        assert_eq!(to_symbols("T égale 20 degrés Celsius"), "T = 20 °C");
        assert_eq!(to_symbols("m égale 2 kilogrammes"), "m = 2\u{a0}kg");
    }

    #[test]
    fn words_that_are_not_maths_stay_words() {
        assert_eq!(to_symbols("aire du disque"), "aire du disque");
        assert_eq!(to_symbols("le mètre étalon"), "le mètre étalon");
    }
}
