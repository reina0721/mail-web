/**
 * Plugin Framework —— Navigation Contract 子路径。
 *
 * Plugin 通过 `@community-go/plugin-framework/navigation` 消费 Sidebar Navigation
 * Contribution 类型（Group Alias 选择 + Parent/Child 声明）。只含类型与纯规则，
 * 无 React/Next/Browser 依赖。
 */

export type {
  NavigationGroupAlias,
  NavigationContribution,
  NavigationParent,
  NavigationChild,
} from './contract';
