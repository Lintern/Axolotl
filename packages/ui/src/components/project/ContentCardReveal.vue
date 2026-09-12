<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import ProjectCardSkeleton from '../project/ProjectCardSkeleton.vue'

const props = withDefaults(
	defineProps<{
		/** False while the card payload is not ready to render. */
		ready?: boolean
		/** True while a refresh buffers already-visible cards under a mask. */
		masking?: boolean
		layout?: 'list' | 'compact' | 'grid' | 'gallery'
	}>(),
	{
		ready: true,
		masking: false,
		layout: 'list',
	},
)

const hasRevealedOnce = ref(props.ready)

watch(
	() => props.ready,
	(value) => {
		if (value) hasRevealedOnce.value = true
	},
)

const showSkeleton = computed(() => !props.ready && !hasRevealedOnce.value)
const showContent = computed(() => props.ready || hasRevealedOnce.value)
</script>

<template>
	<div>
		<ProjectCardSkeleton v-if="showSkeleton" :layout="layout" />
		<div
			v-show="showContent"
			class="card-reveal"
			:class="{
				'card-reveal--visible': ready,
				'card-reveal--masking': masking,
			}"
		>
			<slot />
			<div
				v-if="masking"
				class="pointer-events-none absolute inset-0 z-10 rounded-xl bg-surface-1/40 backdrop-blur-[1px]"
				aria-hidden="true"
			/>
		</div>
	</div>
</template>

<style scoped>
.card-reveal {
	position: relative;
	opacity: 0;
	transition:
		opacity 220ms ease,
		transform 220ms ease;
	transform: translateY(4px);
}

.card-reveal--visible {
	opacity: 1;
	transform: translateY(0);
}

.card-reveal--masking {
	opacity: 0.72;
}
</style>
