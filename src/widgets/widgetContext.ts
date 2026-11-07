import type { InjectionKey } from 'vue'

// Lets a widget component know which WidgetInstance it is rendering
export const WIDGET_ID_KEY: InjectionKey<string> = Symbol('widgetId')
