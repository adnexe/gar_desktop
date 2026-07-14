export type Appearance = 'light' | 'dark' | 'system';
export type ResolvedAppearance = 'light' | 'dark';

export interface NavItem {
    title: string;
    routeName: string;
    icon: object;
}
