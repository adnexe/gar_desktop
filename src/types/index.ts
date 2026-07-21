export type Appearance = 'light' | 'dark' | 'feminin' | 'universel' | 'system';
export type ResolvedAppearance = 'light' | 'dark' | 'feminin' | 'universel';

export interface NavItem {
    title: string;
    routeName: string;
    icon: object;
}
