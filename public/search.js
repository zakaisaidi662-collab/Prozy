/**
 * Nebula Browser - Smart Search / URL Detection
 * 
 * Determines whether user input is a URL or search query,
 * and returns a fully qualified URL in either case.
 */
"use strict";

/**
 * @param {string} input - Raw user input from the address bar
 * @param {string} template - Search engine URL template with %s placeholder
 * @returns {string} Fully qualified URL
 */
function search(input, template) {
    // Trim whitespace
    input = input.trim();

    try {
        // Already a full URL (includes protocol)
        return new URL(input).toString();
    } catch (err) {
        // Not a valid URL as-is
    }

    try {
        // Try adding http:// prefix
        const url = new URL(`http://${input}`);
        // Only treat as URL if hostname has a TLD (contains a dot)
        if (url.hostname.includes(".")) return url.toString();
    } catch (err) {
        // Still not a valid URL
    }

    // Fall back to search engine query
    return template.replace("%s", encodeURIComponent(input));
}
