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
    name: 'configure_model',
    description:
      'Set the default Gemini model for image generation and editing. Persists across sessions. Recommended: gemini-2.0-flash-preview-image-generation (default, free tier). Also available: imagen-3.0-generate-002 (best quality, requires billing), imagen-3.0-fast-generate-001 (fast, requires billing).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        model: {
          type: 'string',
          description: 'Gemini model ID to use (e.g. gemini-2.0-flash-preview-image-generation)',
        },
      },
      required: ['model'],
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
        model: {
          type: 'string',
          description: 'Optional model override for this request (e.g. gemini-2.0-flash-preview-image-generation)',
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
        model: {
          type: 'string',
          description: 'Optional model override for this request (e.g. gemini-2.0-flash-preview-image-generation)',
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
        model: {
          type: 'string',
          description: 'Optional model override for this request',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    description:
      'Generate a video from a text prompt using Gemini Veo. Supports text-to-video, image-to-video (first frame), and first+last frame interpolation. Video generation takes 1-6 minutes. Available models: veo-3.1-generate-preview (latest), veo-3-generate-preview, veo-2-generate-preview.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the video to generate. Include subject, action, style, camera movement, and atmosphere.',
        },
        model: {
          type: 'string',
          description:
            'Veo model to use. Options: veo-3.1-generate-preview (default, latest), veo-3-generate-preview, veo-2-generate-preview.',
        },
        imagePath: {
          type: 'string',
          description: 'Optional: Absolute file path to an image to use as the first frame (image-to-video generation).',
        },
        lastFramePath: {
          type: 'string',
          description:
            'Optional: Absolute file path to an image to use as the last frame (first+last frame interpolation). Requires imagePath to be set.',
        },
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the video. Options: "16:9" (default, landscape), "9:16" (portrait).',
        },
        resolution: {
          type: 'string',
          description: 'Video resolution. Options: "720p" (default), "1080p", "4k".',
        },
        durationSeconds: {
          type: 'number',
          description: 'Video duration in seconds. Options: 4, 6, 8 (default varies by model).',
        },
        numberOfVideos: {
          type: 'number',
          description: 'Number of video variants to generate (default: 1).',
        },
        negativePrompt: {
          type: 'string',
          description: 'Optional: Elements to avoid in the generated video.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'list_video_history',
    description: 'List recently generated videos with their prompts, models, and timestamps.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent videos to show (default: 10, max: 50)',
        },
      },
    },
  },
  {
    name: 'get_status',
    description: 'Check the current configuration status, active model, and last image/video information.',
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
