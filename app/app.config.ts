export default defineAppConfig({
  name: 'notes',
  ui: {
    button: {
      slots: {
        base: 'rounded-lg font-semibold',
      },
      variants: {
        size: {
          xl: { base: 'min-h-11 px-4 py-3 text-sm/5' },
        },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'bg-blue-500 text-neutral-0 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-700',
        },
        {
          color: 'neutral',
          variant: 'link',
          class: 'text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-0',
        },
      ],
    },
    input: {
      variants: {
        variant: {
          outline: 'rounded-lg bg-transparent text-neutral-950 ring-neutral-300 dark:bg-transparent dark:text-neutral-0 dark:ring-neutral-600',
        },
        size: {
          xl: { base: 'h-11 px-4 py-3 text-sm/5' },
        },
      },
      defaultVariants: { size: 'xl' },
    },
    formField: {
      slots: {
        label: 'font-medium leading-[1.2] text-neutral-950 dark:text-neutral-0',
        container: 'mt-1.5',
        help: 'mt-2 text-xs leading-[1.2] text-neutral-600 dark:text-neutral-400',
      },
    },
    colors: {
      primary: 'blue',
      neutral: 'neutral',
      success: 'green',
      error: 'red',
    },
  },
})
