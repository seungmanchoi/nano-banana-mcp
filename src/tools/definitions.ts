const TOOLS = [
  {
    name: 'configure_api_key',
    description: 'Set or update the Gemini API key for image generation. The key is stored locally and persists across sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apiKey: {
          type: 'string',
          description: 'Your Google Gemini API key (get one at https://aistudio.google.com/apikey)',
        },
      },
      required: ['apiKey'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate a new image from a text description using Gemini AI. Returns the generated image and saves it to disk.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'edit_image',
    description: 'Edit an existing image based on text instructions. Provide the file path of the image to modify.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        imagePath: {
          type: 'string',
          description: 'Absolute file path to the image to edit',
        },
        prompt: {
          type: 'string',
          description: 'Instructions for how to edit the image',
        },
        referenceImages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of file paths to reference images for style or content guidance',
        },
      },
      required: ['imagePath', 'prompt'],
    },
  },
  {
    name: 'continue_editing',
    description: 'Continue editing the last generated or edited image. Automatically uses the most recent image from the session.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Instructions for the next edit',
        },
        referenceImages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional reference images for guidance',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'get_status',
    description: 'Check the current configuration status and last image information.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_history',
    description: 'List recently generated and edited images with their prompts and timestamps.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent images to show (default: 10, max: 50)',
        },
      },
    },
  },
] as const;

export default TOOLS;
