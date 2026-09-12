<script setup lang="ts">
withDefaults(
	defineProps<{
		layout?: 'list' | 'compact' | 'grid' | 'gallery'
	}>(),
	{
		layout: 'list',
	},
)
</script>

<template>
	<div
		v-if="layout === 'compact'"
		class="project-card-container flex w-full items-center gap-3 rounded-xl border-[1px] border-solid border-divider bg-bg p-4"
		aria-hidden="true"
	>
		<div class="size-12 shrink-0 animate-pulse rounded-full bg-surface-3"></div>
		<div class="flex min-w-0 flex-1 flex-col gap-2">
			<div class="h-4 w-2/5 animate-pulse rounded bg-surface-3"></div>
			<div class="h-3 w-4/5 animate-pulse rounded bg-surface-2"></div>
		</div>
		<div class="h-3 w-16 shrink-0 animate-pulse rounded bg-surface-2"></div>
	</div>
	<div
		v-else
		class="project-card-container flex w-full flex-col overflow-hidden rounded-xl border-[1px] border-solid border-divider bg-bg"
		aria-hidden="true"
	>
		<div class="aspect-[2/1] w-full animate-pulse bg-surface-2"></div>
		<div class="flex gap-3 p-4">
			<div class="size-16 shrink-0 animate-pulse rounded-2xl bg-surface-3"></div>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<div class="h-4 w-3/5 animate-pulse rounded bg-surface-3"></div>
				<div class="h-3 w-full animate-pulse rounded bg-surface-2"></div>
				<div class="h-3 w-4/5 animate-pulse rounded bg-surface-2"></div>
				<div class="mt-1 flex gap-2">
					<div class="h-5 w-14 animate-pulse rounded-full bg-surface-2"></div>
					<div class="h-5 w-16 animate-pulse rounded-full bg-surface-2"></div>
					<div class="h-5 w-12 animate-pulse rounded-full bg-surface-2"></div>
				</div>
			</div>
		</div>
	</div>
</template>
