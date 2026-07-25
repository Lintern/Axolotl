<template>
	<div
		class="flex min-h-0 flex-1 flex-col gap-4"
		:class="
			isFullscreen ? `fixed inset-0 z-[15] bg-surface-1 p-6 py-8 ${isApp ? 'pt-12' : ''}` : ''
		"
	>
		<div
			v-if="ctx.localCrashAnalysis?.value?.findings.length && !isFullscreen"
			class="flex flex-col gap-2"
		>
			<CollapsibleAdmonition type="critical" :header="localCrashHeader" :items="localCrashItems" />
			<div class="flex justify-end">
				<ButtonStyled type="outlined">
					<button :disabled="exportingCrashContext" @click="handleExportCrashContext">
						<DownloadIcon />
						Export crash context
					</button>
				</ButtonStyled>
			</div>
		</div>
		<CollapsibleAdmonition
			v-if="ctx.crashAnalysis?.value && !isFullscreen"
			type="critical"
			:header="crashHeader"
			:items="crashItems"
			dismissible
			@dismiss="ctx.onDismissCrash?.()"
		/>

		<div class="flex items-center gap-2">
			<StyledInput
				v-model="searchQuery"
				:icon="SearchIcon"
				placeholder="Search logs"
				wrapper-class="flex-1"
				input-class="!h-10"
				clearable
			/>
			<div v-if="ctx.logSources?.value && ctx.activeLogSourceIndex" class="w-[220px]">
				<Combobox
					:model-value="ctx.activeLogSourceIndex.value"
					:options="logSourceOptions"
					@update:model-value="(v) => (ctx.activeLogSourceIndex!.value = v)"
				/>
			</div>
		</div>

		<div class="flex items-center justify-between">
			<ConsoleFilterPills
				v-model="activeFilters"
				:present-levels="presentLevels"
				@toggle="handleFilterToggle"
			/>
			<ConsoleActionButtons
				:show-clear="isLiveSource"
				:has-logs="hasLogs"
				:share-disabled="resolvedShareDisabled"
				:sharing="isSharing"
				:fullscreen="isFullscreen"
				:clear-disabled="resolvedClearDisabled"
				:clear-disabled-tooltip="resolvedClearDisabledTooltip"
				:show-delete="showDelete"
				:delete-disabled="resolvedDeleteDisabled"
				:delete-disabled-tooltip="ctx.deleteDisabledTooltip"
				@clear="handleClear"
				@share="handleShare"
				@toggle-fullscreen="toggleFullscreen"
				@delete="handleDelete"
			/>
		</div>

		<BaseTerminal
			ref="terminalRef"
			class="min-h-0 flex-1"
			:show-input="resolvedShowInput"
			:disable-input="resolvedInputDisabled"
			:disable-input-tooltip="resolvedInputDisabledTooltip"
			:disabled-input-placeholder="resolvedInputDisabledPlaceholder"
			:fullscreen="isFullscreen"
			:empty-state-type="ctx.emptyStateType"
			:loading="resolvedLoading"
			@command="handleCommand"
			@ready="handleTerminalReady"
		/>
	</div>
	<ShareModal ref="shareModal" header="Share Logs" link :social-buttons="false" />
	<NewModal ref="deleteModal" header="Delete log file" :fade="'danger'" max-width="500px">
		<div class="flex flex-col gap-6">
			<Admonition type="critical" header="This is irreversible">
				Deleting this log file cannot be undone. Are you sure you want to continue?
			</Admonition>
		</div>
		<template #actions>
			<div class="flex justify-end gap-2">
				<ButtonStyled type="outlined">
					<button @click="deleteModal?.hide()">
						<XIcon />
						Cancel
					</button>
				</ButtonStyled>
				<ButtonStyled color="red">
					<button :disabled="isDeleting" @click="confirmDelete">
						<TrashIcon />
						Delete
					</button>
				</ButtonStyled>
			</div>
		</template>
	</NewModal>
</template>

<script setup lang="ts">
import { DownloadIcon, SearchIcon, TrashIcon, XIcon } from '@modrinth/assets'
import type { Terminal } from '@xterm/xterm'
import { computed, isRef, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import Admonition from '#ui/components/base/Admonition.vue'
import BaseTerminal from '#ui/components/base/BaseTerminal.vue'
import ButtonStyled from '#ui/components/base/ButtonStyled.vue'
import type { CollapsibleAdmonitionItem } from '#ui/components/base/CollapsibleAdmonition.vue'
import CollapsibleAdmonition from '#ui/components/base/CollapsibleAdmonition.vue'
import Combobox from '#ui/components/base/Combobox.vue'
import StyledInput from '#ui/components/base/StyledInput.vue'
import NewModal from '#ui/components/modal/NewModal.vue'
import ShareModal from '#ui/components/modal/ShareModal.vue'
import { injectModrinthClient } from '#ui/providers'
import { injectModalBehavior } from '#ui/providers/modal-behavior'
import { injectPageContext } from '#ui/providers/page-context'
import { injectNotificationManager } from '#ui/providers/web-notifications.ts'

import ConsoleActionButtons from './components/ConsoleActionButtons.vue'
import ConsoleFilterPills from './components/ConsoleFilterPills.vue'
import {
	clearSearchHighlights,
	colorize,
	getHighlightVersion,
	highlightAppendedRange,
	rewriteTerminal,
	useConsoleFilters,
} from './composables'
import type { ConditionalLevel } from './composables/console-filtering'
import { injectConsoleManager } from './providers'
import type { LogLevel, LogLine } from './types'

const ctx = injectConsoleManager()
const client = injectModrinthClient()
const modalBehavior = injectModalBehavior()
const pageContext = injectPageContext(null)
const { addNotification } = injectNotificationManager()

const localFindingCopy: Record<string, { title: string; action: string }> = {
	jvm_arguments: {
		title: 'Invalid JVM arguments',
		action: 'Remove the reported custom JVM argument, then launch the instance again.',
	},
	out_of_memory: {
		title: 'Minecraft ran out of memory',
		action:
			'Increase the instance memory allocation or remove memory-heavy mods and resource packs.',
	},
	opengl_unsupported: {
		title: 'OpenGL is not supported by the active graphics driver',
		action:
			'Install the graphics driver from the GPU manufacturer and ensure Minecraft uses the intended GPU.',
	},
	pixel_format: {
		title: 'The graphics driver could not set a pixel format',
		action:
			'Update or reinstall the graphics driver and disable conflicting overlays before retrying.',
	},
	openj9: {
		title: 'The selected OpenJ9 runtime is incompatible',
		action:
			'Select a HotSpot-based Java runtime such as Eclipse Temurin or the bundled Minecraft runtime.',
	},
	java_too_new: {
		title: 'The Java runtime is too new for this instance',
		action: 'Select the Java major version expected by this Minecraft and mod-loader version.',
	},
	java_incompatible: {
		title: 'A mod requires a different Java version',
		action:
			'Use a compatible Java runtime or install a build of the reported mod for this Java version.',
	},
	jdk_runtime: {
		title: 'A JDK runtime was selected instead of a JRE',
		action: 'Select a standard HotSpot Java runtime for this Minecraft version.',
	},
	java_32bit: {
		title: 'A 32-bit Java runtime cannot allocate the requested memory',
		action: 'Install and select a 64-bit Java runtime, then retry the launch.',
	},
	java_11_required: {
		title: 'A Mod requires Java 11',
		action: 'Select Java 11 or install a Mod build compatible with the selected Java version.',
	},
	forge_incomplete: {
		title: 'The Forge installation is incomplete',
		action: 'Repair or reinstall the Forge loader for this instance.',
	},
	duplicate_mod: {
		title: 'Duplicate Mods are installed',
		action: 'Keep only one compatible version of each Mod in the mods folder.',
	},
	incompatible_mods: {
		title: 'The installed Mods are incompatible',
		action:
			'Follow the compatibility details in the evidence and update, remove, or replace the conflicting Mods.',
	},
	missing_dependency: {
		title: 'A Mod dependency is missing or unsupported',
		action:
			'Install the required dependency version or use a Mod build matching this Minecraft version.',
	},
	mod_id_limit: {
		title: 'Too many Mods exceeded the ID limit',
		action: 'Remove unused Mods or split the installation into smaller compatible profiles.',
	},
	forge_error: {
		title: 'Forge reported a game error',
		action: 'Review the Forge failure evidence and test the named Mod without recent changes.',
	},
	mod_loader_error: {
		title: 'The Mod loader reported a failure',
		action:
			'Repair the loader installation and verify that the listed Mod files match this game version.',
	},
	mod_loader_failure: {
		title: 'The Mod loader failed before identifying a Mod file',
		action: 'Repair the loader installation and follow the failure message shown in the evidence.',
	},
	stack_analysis: {
		title: 'The stack trace points to an installed Mod',
		action: 'Update or temporarily remove the matched Mod, then test the instance again.',
	},
	short_output: {
		title: 'The game stopped before producing a useful log',
		action:
			'Retry once, then verify Java, the loader installation, and the launcher output for an earlier error.',
	},
	extracted_mod: {
		title: 'An extracted Mod was found',
		action:
			'Remove the extracted directory from the mods folder and install the original jar file.',
	},
	mixin_bootstrap: {
		title: 'Mixin bootstrap is missing',
		action:
			'Repair the mod loader installation and verify that every mod targets the installed loader.',
	},
	mixin_failure: {
		title: 'A Mod Mixin failed to apply',
		action:
			'Update or remove the matched Mod and check that its Minecraft and loader versions are compatible.',
	},
	fabric_solution: {
		title: 'Fabric found an incompatible Mod or missing dependency',
		action: 'Apply the dependency changes listed in the evidence before launching again.',
	},
	mod_config: {
		title: 'A Mod configuration file could not be read',
		action: 'Back up and remove the named configuration file so the Mod can regenerate it.',
	},
	optifine_incompatible: {
		title: 'OptiFine conflicts with the installed loader or Mod',
		action:
			'Install a compatible OptiFine build or remove OptiFine and the conflicting shader Mod.',
	},
	resource_pack: {
		title: 'A shader or resource pack triggered a graphics error',
		action: 'Disable the active shader and resource packs, then re-enable them one at a time.',
	},
	large_resource_pack: {
		title: 'The active resource pack is too large for the graphics configuration',
		action: 'Disable the resource pack or use a lower-resolution version.',
	},
	shaders_optifine: {
		title: 'Shaders Mod and OptiFine are installed together',
		action: 'Remove the separate Shaders Mod because OptiFine already provides shader support.',
	},
	multiple_forge_versions: {
		title: 'The version profile contains multiple Forge versions',
		action: 'Repair the instance so its version profile contains only one Forge installation.',
	},
	forge_java_incompatible: {
		title: 'This Forge version is incompatible with the selected Java runtime',
		action: 'Use the Java version expected by this Forge release or update Forge.',
	},
	content_verification: {
		title: 'A jar failed signature verification',
		action: 'Remove and reinstall the file named in the evidence from a trusted source.',
	},
	optifine_world: {
		title: 'OptiFine prevented the world from loading',
		action: 'Remove OptiFine or install a build compatible with this Minecraft and Forge version.',
	},
	nightconfig_bug: {
		title: 'NightConfig could not read a configuration file',
		action:
			'Back up the config folder, remove the damaged configuration, and let the Mod regenerate it.',
	},
	mod_filename: {
		title: 'A Mod filename contains unsupported characters',
		action: 'Rename or reinstall the Mod jar using a simple Latin-letter filename.',
	},
	definite_mod: {
		title: 'A specific Mod caused the crash',
		action:
			'Update, repair, or temporarily remove the Mod identified by the evidence and matched jar.',
	},
	definite_mod_fabric: {
		title: 'Fabric identified a specific Mod failure',
		action: 'Update or temporarily remove the Mod identified by the Fabric loader evidence.',
	},
	intel_driver: {
		title: 'The Intel graphics driver crashed',
		action: 'Install a current Intel graphics driver or run Minecraft on another available GPU.',
	},
	amd_driver: {
		title: 'The AMD graphics driver crashed',
		action: 'Clean-install a current AMD graphics driver and retry without graphics overlays.',
	},
	nvidia_driver: {
		title: 'The NVIDIA graphics driver crashed',
		action: 'Clean-install a current NVIDIA graphics driver and retry without graphics overlays.',
	},
	manual_debug_crash: {
		title: 'The debug crash shortcut was triggered',
		action: 'Launch again and avoid holding the manual debug-crash key combination.',
	},
	suspected_mod: {
		title: 'The crash report suspects one or more Mods',
		action: 'Update or temporarily remove the suspected and locally matched Mods, then retry.',
	},
	mod_initialization: {
		title: 'A Mod failed to initialize',
		action: 'Update the named Mod and verify that all of its required dependencies are installed.',
	},
	specific_block: {
		title: 'A specific block caused the crash',
		action:
			'Use a world backup or a world editor to remove the block at the coordinates in the evidence.',
	},
	specific_entity: {
		title: 'A specific entity caused the crash',
		action:
			'Use a world backup or a world editor to remove the entity at the coordinates in the evidence.',
	},
}

const localCrashHeader = computed(() => {
	const analysis = ctx.localCrashAnalysis?.value
	const findings = analysis?.findings.length ?? 0
	const sources = analysis?.sources.length ?? 0
	return `${findings} local diagnosis result${findings === 1 ? '' : 's'} from ${sources} related file${sources === 1 ? '' : 's'}`
})

const localCrashItems = computed<CollapsibleAdmonitionItem[]>(() => {
	const analysis = ctx.localCrashAnalysis?.value
	if (!analysis) return []
	return analysis.findings.map((finding) => {
		const copy = localFindingCopy[finding.id] ?? {
			title: finding.id.replaceAll('_', ' '),
			action: 'Review the evidence below and the Mods matched from the local instance.',
		}
		const evidence = finding.evidence.map((item) => `${item.filename}:${item.line} - ${item.text}`)
		const mods = analysis.mods.map((mod) => {
			const identity = mod.name || mod.id || mod.file_name
			const modId = mod.id && mod.id !== identity ? ` (${mod.id})` : ''
			return `Matched Mod: ${identity}${modId} - ${mod.file_name}`
		})
		return {
			title: copy.title,
			descriptions: [copy.action, ...mods, ...evidence],
		}
	})
})

const crashHeader = computed(() => {
	const problems = ctx.crashAnalysis?.value?.analysis.problems ?? []
	const count = problems.length
	return `${count} problem${count !== 1 ? 's' : ''} detected`
})

const crashItems = computed<CollapsibleAdmonitionItem[]>(() => {
	const problems = ctx.crashAnalysis?.value?.analysis.problems ?? []
	return problems.map((p) => ({
		title: p.message,
		descriptions: p.solutions.map((s) => s.message),
	}))
})

const terminalRef = ref<InstanceType<typeof BaseTerminal> | null>(null)
const shareModal = ref<InstanceType<typeof ShareModal> | null>(null)
const deleteModal = ref<InstanceType<typeof NewModal> | null>(null)
const isDeleting = ref(false)
const exportingCrashContext = ref(false)
const searchQuery = ref('')
const isFullscreen = ref(false)
const fullscreenBodyClass = 'modrinth-console-fullscreen-active'
const fullscreenIntercomPadding = 20
const fullscreenIntercomPaddingRequestId = Symbol('console-fullscreen')
const isApp =
	typeof window !== 'undefined' && !!(window as Record<string, unknown>).__TAURI_INTERNALS__
const isSharing = ref(false)
const { activeFilters, toggleFilter, buildFilterPredicate } = useConsoleFilters()
const hasLogs = computed(() => ctx.logLines.value.length > 0)
const presentLevels = computed(() => {
	const levels = new Set<ConditionalLevel>()
	for (const line of ctx.logLines.value) {
		if (line.level === 'debug') levels.add('debug')
		if (line.level === 'trace') levels.add('trace')
		if (levels.size === 2) break
	}
	return levels
})
const isLiveSource = computed(() => {
	const sources = ctx.logSources?.value
	const index = ctx.activeLogSourceIndex?.value
	if (!sources || index === undefined) return true
	return sources[index]?.live ?? true
})
const logSourceOptions = computed(() =>
	(ctx.logSources?.value ?? []).map((s, i) => ({ value: i, label: s.name })),
)

async function handleExportCrashContext() {
	if (!ctx.onExportCrashContext || exportingCrashContext.value) return
	exportingCrashContext.value = true
	try {
		await ctx.onExportCrashContext()
	} finally {
		exportingCrashContext.value = false
	}
}

function buildCombinedPredicate(): ((line: LogLine) => boolean) | null {
	const levelPred = buildFilterPredicate()
	const query = searchQuery.value.trim().toLowerCase()
	if (!levelPred && !query) return null
	return (line: LogLine) => {
		if (levelPred && !levelPred(line)) return false
		if (query && !line.text.toLowerCase().includes(query)) return false
		return true
	}
}

onBeforeUnmount(() => {
	if (isFullscreen.value) {
		document.body.style.overflow = ''
		document.body.classList.remove(fullscreenBodyClass)
		pageContext?.intercomBubble?.requestHorizontalPadding?.(
			fullscreenIntercomPaddingRequestId,
			null,
		)
		modalBehavior?.onHide?.()
	}
})

let lastWrittenIndex = 0
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const resolvedShowInput = computed(() => {
	const v = ctx.showCommandInput
	if (v === undefined) return false
	if (typeof v === 'boolean') return v
	return isRef(v) ? v.value : v
})

const resolvedDisableInput = computed(() => {
	const v = ctx.disableCommandInput
	if (!v) return false
	return isRef(v) ? v.value : v
})

function unwrapMaybeRef<T>(value: T | { value: T } | undefined): T | undefined {
	if (value === undefined) return undefined
	return isRef(value) ? value.value : value
}

// needs historical log start/end flags on ws to be properly useful
const resolvedLoading = computed(() => {
	const v = ctx.loading
	if (!v) return false
	return v.value
})

const resolvedInputDisabled = computed(() => resolvedDisableInput.value || resolvedLoading.value)

const resolvedInputDisabledTooltip = computed(() =>
	resolvedDisableInput.value ? unwrapMaybeRef(ctx.disableCommandInputTooltip) : undefined,
)

const resolvedInputDisabledPlaceholder = computed(() =>
	resolvedInputDisabledTooltip.value ? 'Command input disabled' : 'Server is not running',
)

const resolvedShareDisabled = computed(() => {
	const v = ctx.shareDisabled
	if (!v) return false
	return isRef(v) ? v.value : v
})

const showDelete = computed(() => !isLiveSource.value && ctx.onDelete != null)

const resolvedDeleteDisabled = computed(() => {
	const v = ctx.deleteDisabled
	if (!v) return false
	return isRef(v) ? v.value : v
})

const resolvedClearDisabled = computed(() => {
	const v = ctx.clearDisabled
	if (!v) return false
	return isRef(v) ? v.value : v
})

const resolvedClearDisabledTooltip = computed(() =>
	resolvedClearDisabled.value ? unwrapMaybeRef(ctx.clearDisabledTooltip) : undefined,
)

function handleTerminalReady(_terminal: Terminal) {
	rewriteFiltered()
}

function handleFilterToggle(value: LogLevel | 'all') {
	toggleFilter(value)
	rewriteFiltered()
}

function activeSearchQuery(): string {
	return searchQuery.value.trim().toLowerCase()
}

function rewriteFiltered() {
	const term = terminalRef.value?.terminal
	if (!term) return
	const lines = ctx.logLines.value
	if (resolvedLoading.value && lines.length === 0 && isLiveSource.value) {
		terminalRef.value?.clearEmptyState()
		lastWrittenIndex = 0
		return
	}
	if (lines.length === 0 && isLiveSource.value) {
		writeEmptyState()
		return
	}
	terminalRef.value?.clearEmptyState()
	const predicate = buildCombinedPredicate()
	rewriteTerminal(term, lines, predicate, activeSearchQuery())
	lastWrittenIndex = lines.length
}

function toggleFullscreen() {
	isFullscreen.value = !isFullscreen.value
	if (isFullscreen.value) {
		document.body.style.overflow = 'hidden'
		document.body.classList.add(fullscreenBodyClass)
		pageContext?.intercomBubble?.requestHorizontalPadding?.(
			fullscreenIntercomPaddingRequestId,
			fullscreenIntercomPadding,
		)
		modalBehavior?.onShow?.()
	} else {
		document.body.style.overflow = ''
		document.body.classList.remove(fullscreenBodyClass)
		pageContext?.intercomBubble?.requestHorizontalPadding?.(
			fullscreenIntercomPaddingRequestId,
			null,
		)
		modalBehavior?.onHide?.()
	}
	nextTick(() => {
		terminalRef.value?.fit()
	})
}

function writeEmptyState() {
	terminalRef.value?.writeEmptyState()
	lastWrittenIndex = 0
}

watch(ctx.logLines, (lines, oldLines) => {
	const term = terminalRef.value?.terminal
	if (!term) return

	if (lines.length === 0 && isLiveSource.value) {
		if (resolvedLoading.value) {
			terminalRef.value?.clearEmptyState()
			lastWrittenIndex = 0
			return
		}

		writeEmptyState()
		return
	}

	if (
		terminalRef.value?.showingEmptyState ||
		lines !== oldLines ||
		lines.length < lastWrittenIndex
	) {
		terminalRef.value?.clearEmptyState()
		rewriteFiltered()
		return
	}

	const predicate = buildCombinedPredicate()
	const newLines: string[] = []
	for (let i = lastWrittenIndex; i < lines.length; i++) {
		if (!predicate || predicate(lines[i])) {
			newLines.push(colorize(lines[i]))
		}
	}
	if (newLines.length > 0) {
		const buffer = term.buffer.active
		const onFreshLine = buffer.cursorX === 0
		const data = onFreshLine ? newLines.join('\r\n') : '\r\n' + newLines.join('\r\n')
		const fromRow = buffer.baseY + buffer.cursorY
		const version = getHighlightVersion(term)
		term.write(data, () => {
			highlightAppendedRange(term, fromRow, version)
		})
	}
	lastWrittenIndex = lines.length
})

watch(searchQuery, () => {
	if (searchDebounce) clearTimeout(searchDebounce)
	searchDebounce = setTimeout(() => {
		rewriteFiltered()
	}, 200)
})

watch(resolvedLoading, (loading) => {
	if (!loading) {
		rewriteFiltered()
	}
})

function handleCommand(cmd: string) {
	if (resolvedInputDisabled.value) return
	ctx.sendCommand?.(cmd)
}

function handleClear() {
	if (resolvedClearDisabled.value) return
	const term = terminalRef.value?.terminal
	if (term) clearSearchHighlights(term)
	terminalRef.value?.reset()
	lastWrittenIndex = 0
	ctx.onClear?.()
}

function handleDelete() {
	deleteModal.value?.show()
}

async function confirmDelete() {
	if (!ctx.onDelete) return
	isDeleting.value = true
	try {
		await ctx.onDelete()
		deleteModal.value?.hide()
	} catch (err) {
		console.error('Failed to delete log file:', err)
		addNotification({
			type: 'error',
			title: 'Failed to delete log file',
			text: typeof err === 'string' ? err : 'Unknown error.',
		})
	} finally {
		isDeleting.value = false
	}
}

async function handleShare() {
	const predicate = buildCombinedPredicate()
	const lines = predicate ? ctx.logLines.value.filter(predicate) : ctx.logLines.value
	const content = lines.map((l) => l.text).join('\n')

	isSharing.value = true
	try {
		const data = await client.mclogs.logs_v1.create(content)
		if (data.url) {
			shareModal.value?.show(data.url)
		}
	} catch (err) {
		console.error('Failed to share logs:', err)
		addNotification({
			type: 'error',
			title: 'Failed to share logs',
			text: typeof err === 'string' ? err : 'Unknown error.',
		})
	} finally {
		isSharing.value = false
	}
}
</script>

<style>
.modrinth-console-fullscreen-active .intercom-lightweight-app,
.modrinth-console-fullscreen-active .intercom-lightweight-app-launcher,
.modrinth-console-fullscreen-active .intercom-lightweight-app-messenger,
.modrinth-console-fullscreen-active .intercom-launcher-frame,
.modrinth-console-fullscreen-active .intercom-messenger-frame,
.modrinth-console-fullscreen-active #intercom-container,
.modrinth-console-fullscreen-active #intercom-frame,
.modrinth-console-fullscreen-active iframe[name='intercom-launcher-frame'],
.modrinth-console-fullscreen-active iframe[name='intercom-messenger-frame'] {
	z-index: 14 !important;
}

.modrinth-console-fullscreen-active .loading-indicator-container,
.modrinth-console-fullscreen-active .app-contents::before {
	z-index: 14 !important;
}

.modrinth-console-fullscreen-active .app-grid-navbar,
.modrinth-console-fullscreen-active .app-grid-statusbar {
	z-index: 0 !important;
}
</style>
