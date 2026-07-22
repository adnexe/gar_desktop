export type Appearance = 'light' | 'dark' | 'feminin' | 'universel' | 'emeraude' | 'ambre' | 'doux' | 'system';
export type ResolvedAppearance = 'light' | 'dark' | 'feminin' | 'universel' | 'emeraude' | 'ambre' | 'doux';

export interface NavItem {
    title: string;
    routeName: string;
    icon: object;
}
