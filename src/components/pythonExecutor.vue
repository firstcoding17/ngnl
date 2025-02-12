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
import axios from "axios";

export default {
  data() {
    return {
      result: null,
    };
  },
  methods: {
    async executePythonScript() {
      try {
        console.log("🚀 Sending API request...");
        const response = await axios.post(
          "http://localhost:5000/api/run-python",
          {
            scriptName: "my_script",
            args: [1, 2, 3, 4, 5],
          },
          {
            headers: { "Content-Type": "application/json" },
          },
        );

        console.log("✅ Response received:", response.data);
        this.result = response.data.output;
      } catch (error) {
        console.error("❌ Error executing Python script:", error);
      }
    },
  },
};
</script>
