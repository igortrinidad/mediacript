<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Rendered size in px (the mark is always square). */
    size?: number
    /** Plays the "transcript being written" loop — the play head pulses and the three lines fill in sequence. */
    animated?: boolean
  }>(),
  { size: 64, animated: false }
)

/*
 * SVG gradient ids are global to the document, so two marks on the same page
 * would share (and fight over) a single <defs>. One id per instance avoids it.
 */
let instances = 0
const gradientId = `mediacript-logo-${++instances}`
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="logo-mark"
    :class="{ animated }"
    role="img"
    aria-label="Mediacript"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#8FD3FE" />
        <stop offset="1" stop-color="#3B96E0" />
      </linearGradient>
    </defs>
    <rect width="256" height="256" rx="56" :fill="`url(#${gradientId})`" />
    <path class="play" d="M44 86 L44 170 L118 128 Z" fill="#FFFFFF" />
    <rect class="line line-1" x="128" y="87" width="64" height="18" rx="9" fill="#FFFFFF" />
    <rect class="line line-2" x="128" y="119" width="84" height="18" rx="9" fill="#FFFFFF" />
    <rect class="line line-3" x="128" y="151" width="48" height="18" rx="9" fill="#FFFFFF" />
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  flex-shrink: 0;
}

.logo-mark .play {
  transform-origin: 81px 128px;
}

.logo-mark .line {
  transform-origin: 128px center;
}

.logo-mark.animated .play {
  animation: play-pulse 2.4s ease-in-out infinite;
}

.logo-mark.animated .line-1 {
  animation: line-write 2.4s ease-in-out infinite;
}

.logo-mark.animated .line-2 {
  animation: line-write 2.4s ease-in-out 0.2s infinite;
}

.logo-mark.animated .line-3 {
  animation: line-write 2.4s ease-in-out 0.4s infinite;
}

@keyframes play-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.12);
  }
}

@keyframes line-write {
  0%,
  100% {
    transform: scaleX(1);
    opacity: 1;
  }
  35% {
    transform: scaleX(0.12);
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo-mark.animated .play,
  .logo-mark.animated .line {
    animation: none;
  }
}
</style>
