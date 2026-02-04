<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Chart, registerables, type ChartType, type ChartData, type ChartOptions } from 'chart.js';

	Chart.register(...registerables);

	interface Props {
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		height?: string;
	}

	let { type, data, options = {}, height = '300px' }: Props = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	const defaultOptions: ChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				position: 'bottom',
				labels: {
					usePointStyle: true,
					padding: 20
				}
			}
		}
	};

	function createChart() {
		if (chart) {
			chart.destroy();
		}

		chart = new Chart(canvas, {
			type,
			data,
			options: { ...defaultOptions, ...options }
		});
	}

	onMount(() => {
		createChart();
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
			chart = null;
		}
	});

	$effect(() => {
		if (chart && data) {
			chart.data = data;
			chart.update();
		}
	});
</script>

<div class="chart-container" style="height: {height};">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.chart-container {
		position: relative;
		width: 100%;
	}
</style>
