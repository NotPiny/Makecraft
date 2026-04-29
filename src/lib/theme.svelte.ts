import { browser } from '$app/environment';

export const themeList = ['brand', 'simple'] as const;
export type Theme = (typeof themeList)[number];

export const theme = $state<{ current: Theme }>({
	current: browser ? ((localStorage.getItem('theme') as Theme) ?? 'brand') : 'brand'
});

export function setTheme(value: Theme) {
	theme.current = value;
	if (browser) localStorage.setItem('theme', value);
}
