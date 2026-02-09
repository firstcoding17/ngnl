<template>
  <div>
    <button @click="executePythonScript">Run Python Script</button>
    <div v-if="result">
      <p>Mean: {{ result.mean }}</p>
      <p>Standard Deviation: {{ result.std_dev }}</p>
    </div>
  </div>
</template>

<script>
import { runPythonScript } from "@/api/pythonApi";

export default {
  data() {
    return {
      result: null,
    };
  },
  methods: {
    async executePythonScript() {
      try {
        console.log("Sending API request...");
        this.result = await runPythonScript("my_script", [1, 2, 3, 4, 5]);
        console.log("Response received:", this.result);
      } catch (error) {
        console.error("Error executing Python script:", error);
      }
    },
  },
};
</script>
