<script setup lang="ts">
import { DownloadIcon, SpinnerIcon, TriangleAlertIcon } from '@modrinth/assets'
import {
	ButtonStyled,
	defineMessages,
	EmptyState,
	injectNotificationManager,
	SettingsSection,
	useVIntl,
} from '@modrinth/ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import {
	getVisibleSettingsCategories,
	getVisibleSettingsGroups,
} from '@/components/ui/settings/settings-registry'
import { type AppSettings, get, set } from '@/helpers/settings'
import {
	DEFAULT_APP_SETTINGS,
	fieldsForCategories,
	type ResetScopeKind,
} from '@/helpers/settings-reset'
import { useTheming } from '@/store/state'

type Step = 'select' | 'confirm' | 'applying' | 'result'

const themeStore = useTheming()
const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const step = ref<Step>('select')
const scopeKind = ref<ResetScopeKind>('group')
const selectedGroupId = ref('interface')
const selectedCategoryId = ref('interface')
const applying = ref(false)
const resultOk = ref(false)
const resultError = ref('')
const resetFieldCount = ref(0)

const groups = computed(() => getVisibleSettingsGroups(!!themeStore.devMode))
const categories = computed(() => getVisibleSettingsCategories(!!themeStore.devMode))

const groupCategoryIds = computed(() => {
	const group = groups.value.find((item) => item.id === selectedGroupId.value)
	return group?.categories.map((category) => category.id) ?? []
})

const targetFields = computed(() => {
	if (scopeKind.value === 'all') {
		return fieldsForCategories(categories.value.map((category) => category.id))
	}
	if (scopeKind.value === 'group') {
		return fieldsForCategories(groupCategoryIds.value)
	}
	return fieldsForCategories([selectedCategoryId.value])
})

const messages = defineMessages({
	title: {
		id: 'app.settings.reset.title',
		defaultMessage: 'Reset & export',
	},
	description: {
		id: 'app.settings.reset.description',
		defaultMessage:
			'Reset launcher settings to their defaults by page, group, or everything. Export a backup first if you may want to restore values later.',
	},
	stepSelect: { id: 'app.settings.reset.step.select', defaultMessage: 'Choose what to reset' },
	stepConfirm: { id: 'app.settings.reset.step.confirm', defaultMessage: 'Confirm reset' },
	stepApplying: { id: 'app.settings.reset.step.applying', defaultMessage: 'Applying reset' },
	stepResult: { id: 'app.settings.reset.step.result', defaultMessage: 'Result' },
	scopeLabel: { id: 'app.settings.reset.scope', defaultMessage: 'Reset scope' },
	scopeAll: { id: 'app.settings.reset.scope.all', defaultMessage: 'All settings' },
	scopeGroup: { id: 'app.settings.reset.scope.group', defaultMessage: 'One settings group' },
	scopeCategory: { id: 'app.settings.reset.scope.category', defaultMessage: 'One settings page' },
	groupLabel: { id: 'app.settings.reset.group', defaultMessage: 'Group' },
	categoryLabel: { id: 'app.settings.reset.category', defaultMessage: 'Settings page' },
	fieldCount: {
		id: 'app.settings.reset.field-count',
		defaultMessage:
			'{count, plural, one {# setting will be reset} other {# settings will be reset}}',
	},
	exportLabel: { id: 'app.settings.reset.export', defaultMessage: 'Export current settings' },
	exportHint: {
		id: 'app.settings.reset.export.hint',
		defaultMessage: 'Saves a JSON snapshot of the current launcher settings.',
	},
	confirmTitle: {
		id: 'app.settings.reset.confirm.title',
		defaultMessage: 'Reset these settings?',
	},
	confirmBody: {
		id: 'app.settings.reset.confirm.body',
		defaultMessage:
			'This restores the selected settings to their factory defaults. Instance files, accounts, and downloads are not deleted.',
	},
	cancel: { id: 'app.settings.reset.cancel', defaultMessage: 'Cancel' },
	confirm: { id: 'app.settings.reset.confirm', defaultMessage: 'Reset to defaults' },
	applyingLabel: {
		id: 'app.settings.reset.applying',
		defaultMessage: 'Restoring defaults…',
	},
	successTitle: {
		id: 'app.settings.reset.success.title',
		defaultMessage: 'Settings reset',
	},
	successBody: {
		id: 'app.settings.reset.success.body',
		defaultMessage: 'The selected settings were restored to their defaults.',
	},
	failedTitle: {
		id: 'app.settings.reset.failed.title',
		defaultMessage: 'Reset failed',
	},
	done: { id: 'app.settings.reset.done', defaultMessage: 'Done' },
	back: { id: 'app.settings.reset.back', defaultMessage: 'Back' },
	continueLabel: { id: 'app.settings.reset.continue', defaultMessage: 'Continue' },
	leaveTitle: {
		id: 'app.settings.reset.leave.title',
		defaultMessage: 'Leave without resetting?',
	},
	leaveBody: {
		id: 'app.settings.reset.leave.body',
		defaultMessage: 'You have selected a reset scope but have not applied it yet.',
	},
	stay: { id: 'app.settings.reset.leave.stay', defaultMessage: 'Stay' },
	leave: { id: 'app.settings.reset.leave', defaultMessage: 'Leave' },
})

const canContinueFromSelect = computed(() => targetFields.value.length > 0)
const isDirtyConfirm = computed(() => step.value === 'confirm')

const leaveModalOpen = ref(false)
let leaveResolver: ((value: boolean) => void) | null = null

function requestLeave(): Promise<boolean> {
	leaveModalOpen.value = true
	return new Promise((resolve) => {
		leaveResolver = resolve
	})
}

function resolveLeave(allow: boolean) {
	leaveModalOpen.value = false
	leaveResolver?.(allow)
	leaveResolver = null
}

onBeforeRouteLeave(async () => {
	if (!isDirtyConfirm.value || applying.value) return true
	return requestLeave()
})

onBeforeUnmount(() => {
	if (leaveResolver) resolveLeave(true)
})

async function exportSettings() {
	try {
		const current = await get()
		const payload = {
			exportedAt: new Date().toISOString(),
			app: 'axolotl-launcher',
			settings: current,
		}
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `axolotl-settings-${payload.exportedAt.slice(0, 19).replace(/[:]/g, '-')}.json`
		anchor.click()
		URL.revokeObjectURL(url)
	} catch (error) {
		handleError(error as Error)
	}
}

function goToConfirm() {
	if (!canContinueFromSelect.value) return
	step.value = 'confirm'
}

function backToSelect() {
	step.value = 'select'
}

async function applyReset() {
	applying.value = true
	step.value = 'applying'
	resultError.value = ''
	try {
		const current = (await get()) as AppSettings
		const next: AppSettings = { ...current }
		const fields = targetFields.value
		for (const field of fields) {
			;(next as Record<string, unknown>)[field] = (DEFAULT_APP_SETTINGS as Record<string, unknown>)[
				field
			]
		}
		// Privacy fields are preserved by settings_set; apply them via dedicated APIs when selected.
		const privacySelected =
			scopeKind.value === 'all' ||
			(scopeKind.value === 'group' && selectedGroupId.value === 'data-privacy') ||
			(scopeKind.value === 'category' && selectedCategoryId.value === 'privacy-data')

		await set(next)
		if (privacySelected) {
			const { setDiscordRpcEnabled, setTelemetryEnabled } = await import('@/helpers/settings')
			await setTelemetryEnabled(DEFAULT_APP_SETTINGS.telemetry)
			await setDiscordRpcEnabled(DEFAULT_APP_SETTINGS.discord_rpc)
		}
		// Shortcut bindings live in localStorage; clear them when that page is included.
		const includesShortcuts =
			scopeKind.value === 'all' ||
			(scopeKind.value === 'group' && groupCategoryIds.value.includes('shortcut-settings')) ||
			(scopeKind.value === 'category' && selectedCategoryId.value === 'shortcut-settings')
		if (includesShortcuts) {
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith('axolotl-shortcut-binding-')) localStorage.removeItem(key)
			}
		}

		resetFieldCount.value = fields.length + (privacySelected ? 2 : 0)
		resultOk.value = true
	} catch (error) {
		resultOk.value = false
		resultError.value = error instanceof Error ? error.message : String(error)
		handleError(error as Error)
	} finally {
		applying.value = false
		step.value = 'result'
	}
}

const stepLabel = computed(() => {
	switch (step.value) {
		case 'select':
			return formatMessage(messages.stepSelect)
		case 'confirm':
			return formatMessage(messages.stepConfirm)
		case 'applying':
			return formatMessage(messages.stepApplying)
		default:
			return formatMessage(messages.stepResult)
	}
})
</script>

<template>
	<div class="flex flex-col gap-[var(--gap-lg)]">
		<SettingsSection :title="formatMessage(messages.title)">
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.description) }}</p>
			<div class="mt-[var(--gap-md)] flex items-center gap-2 text-sm font-semibold text-contrast">
				<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{{ stepLabel }}</span>
			</div>
		</SettingsSection>

		<!-- Step: select -->
		<SettingsSection v-if="step === 'select'" :title="formatMessage(messages.stepSelect)">
			<div class="flex flex-col gap-[var(--gap-md)]">
				<label class="flex flex-col gap-1 text-sm">
					<span class="font-semibold text-contrast">{{ formatMessage(messages.scopeLabel) }}</span>
					<select
						v-model="scopeKind"
						class="h-10 rounded-[var(--radius-md)] border border-solid border-divider bg-surface-2 px-2 text-contrast"
					>
						<option value="all">{{ formatMessage(messages.scopeAll) }}</option>
						<option value="group">{{ formatMessage(messages.scopeGroup) }}</option>
						<option value="category">{{ formatMessage(messages.scopeCategory) }}</option>
					</select>
				</label>

				<label v-if="scopeKind === 'group'" class="flex flex-col gap-1 text-sm">
					<span class="font-semibold text-contrast">{{ formatMessage(messages.groupLabel) }}</span>
					<select
						v-model="selectedGroupId"
						class="h-10 rounded-[var(--radius-md)] border border-solid border-divider bg-surface-2 px-2 text-contrast"
					>
						<option v-for="group in groups" :key="group.id" :value="group.id">
							{{ formatMessage(group.name) }}
						</option>
					</select>
				</label>

				<label v-if="scopeKind === 'category'" class="flex flex-col gap-1 text-sm">
					<span class="font-semibold text-contrast">{{
						formatMessage(messages.categoryLabel)
					}}</span>
					<select
						v-model="selectedCategoryId"
						class="h-10 rounded-[var(--radius-md)] border border-solid border-divider bg-surface-2 px-2 text-contrast"
					>
						<option v-for="category in categories" :key="category.id" :value="category.id">
							{{ formatMessage(category.name) }}
						</option>
					</select>
				</label>

				<p class="m-0 text-sm text-secondary">
					{{
						formatMessage(messages.fieldCount, {
							count: canContinueFromSelect ? targetFields.length : 0,
						})
					}}
				</p>

				<div class="flex flex-wrap items-center gap-[var(--gap-sm)]">
					<ButtonStyled>
						<button type="button" @click="exportSettings">
							<DownloadIcon />
							{{ formatMessage(messages.exportLabel) }}
						</button>
					</ButtonStyled>
					<span class="text-xs text-secondary">{{ formatMessage(messages.exportHint) }}</span>
				</div>

				<div class="flex justify-end">
					<ButtonStyled color="brand">
						<button type="button" :disabled="!canContinueFromSelect" @click="goToConfirm">
							{{ formatMessage(messages.continueLabel) }}
						</button>
					</ButtonStyled>
				</div>
			</div>
		</SettingsSection>

		<!-- Step: confirm -->
		<SettingsSection v-else-if="step === 'confirm'" :title="formatMessage(messages.confirmTitle)">
			<div class="flex flex-col gap-[var(--gap-md)]">
				<div
					class="flex items-start gap-2 rounded-[var(--radius-md)] border border-solid border-divider bg-surface-2 p-[var(--gap-md)]"
				>
					<TriangleAlertIcon class="mt-0.5 size-5 shrink-0 text-brand-red" />
					<div class="flex min-w-0 flex-col gap-1">
						<p class="m-0 font-semibold text-contrast">
							{{ formatMessage(messages.confirmTitle) }}
						</p>
						<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.confirmBody) }}</p>
					</div>
				</div>
				<p class="m-0 text-sm text-secondary">
					{{
						formatMessage(messages.fieldCount, {
							count: targetFields.length,
						})
					}}
				</p>
				<div class="flex flex-wrap items-center gap-[var(--gap-sm)]">
					<ButtonStyled>
						<button type="button" @click="exportSettings">
							<DownloadIcon />
							{{ formatMessage(messages.exportLabel) }}
						</button>
					</ButtonStyled>
				</div>
				<div class="flex justify-end gap-[var(--gap-sm)]">
					<ButtonStyled>
						<button type="button" @click="backToSelect">
							{{ formatMessage(messages.back) }}
						</button>
					</ButtonStyled>
					<ButtonStyled color="brand">
						<button type="button" @click="applyReset">
							{{ formatMessage(messages.confirm) }}
						</button>
					</ButtonStyled>
				</div>
			</div>
		</SettingsSection>

		<!-- Step: applying -->
		<SettingsSection v-else-if="step === 'applying'" :title="formatMessage(messages.stepApplying)">
			<div class="flex flex-col items-center gap-[var(--gap-md)] py-[var(--gap-xl)]">
				<SpinnerIcon class="size-8 animate-spin text-brand" aria-hidden="true" />
				<p class="m-0 text-sm text-secondary" aria-live="polite">
					{{ formatMessage(messages.applyingLabel) }}
				</p>
				<div class="w-full max-w-md space-y-[var(--gap-sm)]" aria-hidden="true">
					<div class="h-10 w-full animate-pulse rounded-[var(--radius-md)] bg-surface-2"></div>
					<div class="h-10 w-full animate-pulse rounded-[var(--radius-md)] bg-surface-2"></div>
					<div class="h-10 w-full animate-pulse rounded-[var(--radius-md)] bg-surface-2"></div>
				</div>
			</div>
		</SettingsSection>

		<!-- Step: result -->
		<SettingsSection v-else :title="formatMessage(messages.stepResult)">
			<EmptyState
				v-if="resultOk"
				type="done"
				compact
				:heading="formatMessage(messages.successTitle)"
				:description="formatMessage(messages.successBody)"
			>
				<template #actions>
					<ButtonStyled color="brand">
						<button type="button" @click="step = 'select'">
							{{ formatMessage(messages.done) }}
						</button>
					</ButtonStyled>
				</template>
			</EmptyState>
			<EmptyState
				v-else
				type="error"
				compact
				:heading="formatMessage(messages.failedTitle)"
				:description="resultError"
			>
				<template #actions>
					<ButtonStyled>
						<button type="button" @click="step = 'select'">
							{{ formatMessage(messages.back) }}
						</button>
					</ButtonStyled>
				</template>
			</EmptyState>
		</SettingsSection>

		<Teleport to="body">
			<div
				v-if="leaveModalOpen"
				class="fixed inset-0 z-[300] grid place-items-center bg-black/50 p-6"
				role="dialog"
				aria-modal="true"
				:aria-label="formatMessage(messages.leaveTitle)"
			>
				<div
					class="flex w-full max-w-md flex-col gap-[var(--gap-md)] rounded-[var(--radius-xl)] border border-solid border-divider bg-surface-3 p-[var(--gap-xl)] shadow-lg"
				>
					<p class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.leaveTitle) }}
					</p>
					<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.leaveBody) }}</p>
					<div class="flex justify-end gap-[var(--gap-sm)]">
						<ButtonStyled>
							<button type="button" @click="resolveLeave(false)">
								{{ formatMessage(messages.stay) }}
							</button>
						</ButtonStyled>
						<ButtonStyled color="red">
							<button type="button" @click="resolveLeave(true)">
								{{ formatMessage(messages.leave) }}
							</button>
						</ButtonStyled>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>
