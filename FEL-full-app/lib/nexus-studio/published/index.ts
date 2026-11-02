// THE PUBLISHED VENUES (NEX-02; lib/nexus-studio/published.ts says what a publication is and how it loads).
//
// To publish a venue: press Publish in Nexus Studio (it runs the publish gate and downloads `<venueId>.venue.json`), put the file
// in this folder under its mode — `published/<mode>/<venueId>.venue.json`, the path the Studio names — import it below and add
// it to the list, and open a PR. The merge ships it: the venue becomes that mode's default place, with Restore on the splash.
// The FIRST entry for a mode is its default. Removing an entry unpublishes it (the shipped place is the default again).
//
// published.test.ts refuses a file in this folder that is not listed here, a listed file that fails the sanitiser or the publish
// gate, a file in the wrong folder or under the wrong name, and a venue listed twice. Nothing is published today: every mode
// plays exactly the places it shipped with.

export const PUBLISHED_VENUE_FILES: readonly unknown[] = [];
