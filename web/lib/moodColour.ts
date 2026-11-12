// A song's colour from its mood and energy, using the hue rule of TargetPalette in
// internal/mix/cover.go so the charts preview the cover's palette: happy is warm (golden when
// calm, orange-red when energetic), sad is cool (blue when calm, violet when energetic). Energy
// raises saturation. Lightness is set per colour scheme so the dots read on either background.
export function moodColour(mood: number, energy: number, dark: boolean): string {
    const hue = mood >= 0.5 ? 40 - 25 * energy : 210 + 60 * energy;
    // a little more saturated than the cover's palette, so calm songs aren't grey dots
    const sat = 30 + 50 * energy;
    const lift = 12 * (mood - 0.5);
    const light = (dark ? 64 : 46) + lift;
    return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}
