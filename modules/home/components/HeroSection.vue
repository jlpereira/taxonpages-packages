<template>
  <section class="relative overflow-hidden py-24 sm:py-32 lg:py-40">
    <div class="absolute inset-0 bg-gradient-to-br from-[var(--tp-primary)] to-[var(--tp-secondary)]" />
    <div
      class="absolute inset-0 opacity-10"
      style="background-image: radial-gradient(circle at 25% 50%, white 1px, transparent 1px), radial-gradient(circle at 75% 50%, white 1px, transparent 1px); background-size: 60px 60px"
    />

    <div class="relative container mx-auto px-6 text-center">
      <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--tp-primary-content)] mb-6 animate-fade-in">
        {{ title }}
      </h1>
      <p class="text-lg sm:text-xl text-[var(--tp-primary-content)]/80 max-w-2xl mx-auto mb-10 animate-fade-in-delay">
        {{ tagline }}
      </p>
      <div class="flex flex-wrap justify-center gap-4 animate-fade-in-delay-2">
        <RouterLink
          to="/otus"
          class="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-[var(--tp-base-foreground)] text-[var(--tp-base-content)] font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5"
        >
          Explore Taxa
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </RouterLink>
        <RouterLink
          to="/news"
          class="inline-flex items-center gap-2 px-8 py-3 rounded-lg border-2 border-[var(--tp-primary-content)]/30 text-[var(--tp-primary-content)] font-semibold hover:bg-[var(--tp-primary-content)]/10 transition-all duration-300"
        >
          Latest News
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: 'TaxonPages'
  },
  tagline: {
    type: String,
    default: 'Explore biodiversity data powered by TaxonWorks'
  }
})
</script>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out both;
}

.animate-fade-in-delay {
  animation: fade-in 0.8s ease-out 0.2s both;
}

.animate-fade-in-delay-2 {
  animation: fade-in 0.8s ease-out 0.4s both;
}
</style>
