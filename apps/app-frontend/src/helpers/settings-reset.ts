import type {
	SettingsCategoryId,
	SettingsGroupId,
} from '@/components/ui/settings/settings-category-definitions'
import type { AppSettings } from '@/helpers/settings'
import { DEFAULT_FEATURE_FLAGS } from '@/store/theme'

export type ResetScopeKind = 'all' | 'group' | 'category'

/** Keys intentionally never reset (paths, onboarding, schema, privacy consent). */
export const PROTECTED_SETTINGS_KEYS = new Set<keyof AppSettings>([
	'custom_dir',
	'prev_custom_dir',
	'version',
	'migrated',
	'onboarded',
	'onboarding_version',
	'onboarding_instance_tour_completed',
	'telemetry_consent_version',
	'pending_update_toast_for_version',
	'developer_mode',
])

type AppSettingsDefaults = Pick<
	AppSettings,
	Exclude<keyof AppSettings, 'custom_dir' | 'prev_custom_dir' | 'java_globals'>
>

export const DEFAULT_APP_SETTINGS: AppSettingsDefaults = {
	max_concurrent_downloads: 20,
	max_concurrent_writes: 10,
	download_engine: 'legacy',
	auto_concurrent_downloads: true,
	minecraft_metadata_source: 'auto',
	minecraft_file_source: 'auto',
	modrinth_source: 'auto',
	curseforge_source: 'auto',
	bypass_curseforge_download_restrictions: true,
	mojang_auth_source: 'auto',

	theme: 'system',
	accent_color: 'system',
	locale: 'en-US',
	default_page: 'Home',
	collapsed_navigation: false,
	hide_nametag_skins_page: false,
	advanced_rendering: true,
	native_decorations: false,
	toggle_sidebar: true,
	custom_background_path: null,
	custom_background_blur: 12,
	custom_background_opacity: 85,
	transparent_background: false,
	transparent_background_opacity: 70,
	transparent_background_blur: true,
	sidebar_instance_count: 5,
	auto_hide_downloads_button: false,
	home_layout: 'standard',
	minimal_home_instance_id: null,
	close_behavior: 'ask',
	log_level: 'info',
	home_widgets: null,
	terracotta_public_nodes: ['wss://center.node.1tmc.top'],

	telemetry: false,
	telemetry_consent_version: 0,
	discord_rpc: false,
	onboarded: true,
	onboarding_version: 0,
	onboarding_instance_tour_completed: false,

	extra_launch_args: [],
	custom_env_vars: [],
	memory: { maximum: 2048, automatic: true, optimize_before_launch: false },
	force_fullscreen: false,
	maximize_window: false,
	game_resolution: [854, 480],
	hide_on_process_start: false,
	enter_lightweight_mode_on_game_launch: false,
	auto_set_java_high_performance_mode: true,
	hooks: {},

	migrated: true,

	developer_mode: false,
	feature_flags: { ...DEFAULT_FEATURE_FLAGS },

	skipped_update: null,
	pending_update_toast_for_version: null,
	auto_download_updates: null,

	version: 3,
}

/** Which settings fields each settings category owns for reset. */
export const CATEGORY_RESET_FIELDS: Partial<Record<SettingsCategoryId, (keyof AppSettings)[]>> = {
	interface: [
		'theme',
		'accent_color',
		'advanced_rendering',
		'native_decorations',
		'close_behavior',
		'custom_background_path',
		'custom_background_blur',
		'custom_background_opacity',
		'transparent_background',
		'transparent_background_opacity',
		'transparent_background_blur',
	],
	'home-navigation': [
		'default_page',
		'home_layout',
		'minimal_home_instance_id',
		'home_widgets',
		'sidebar_instance_count',
		'auto_hide_downloads_button',
		'hide_nametag_skins_page',
		'toggle_sidebar',
		'collapsed_navigation',
	],
	'shortcut-settings': [],
	'language-translation': ['locale'],
	ai: [],
	'launch-defaults': [
		'force_fullscreen',
		'maximize_window',
		'game_resolution',
		'hide_on_process_start',
		'enter_lightweight_mode_on_game_launch',
		'extra_launch_args',
		'custom_env_vars',
		'hooks',
	],
	'java-performance': ['memory', 'auto_set_java_high_performance_mode'],
	'content-downloads': [
		'max_concurrent_downloads',
		'max_concurrent_writes',
		'download_engine',
		'auto_concurrent_downloads',
		'minecraft_metadata_source',
		'minecraft_file_source',
		'modrinth_source',
		'curseforge_source',
		'bypass_curseforge_download_restrictions',
	],
	'network-multiplayer': ['mojang_auth_source', 'terracotta_public_nodes'],
	'storage-backups': [],
	'privacy-data': ['telemetry', 'discord_rpc'],
	updates: ['skipped_update', 'auto_download_updates'],
	logs: ['log_level'],
	'reset-export': [],
	about: [],
	'feature-flags': ['feature_flags'],
}

export function fieldsForCategories(categoryIds: SettingsCategoryId[]): (keyof AppSettings)[] {
	const fields = new Set<keyof AppSettings>()
	for (const id of categoryIds) {
		for (const field of CATEGORY_RESET_FIELDS[id] ?? []) {
			if (!PROTECTED_SETTINGS_KEYS.has(field)) fields.add(field)
		}
	}
	return [...fields]
}

export function categoriesForGroup(groupId: SettingsGroupId, categoryIds: SettingsCategoryId[]) {
	// Resolved by caller from registry to avoid a cycle; helper kept for tests.
	return categoryIds
}
