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
          color: 'warning',
          variant: 'solid',
          class: 'text-neutral-950 dark:text-neutral-950',
        },
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
    toast: {
      slots: {
        root: 'items-start gap-2 rounded-lg bg-neutral-0 p-3 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-700',
        title: 'text-sm/5 font-medium text-neutral-950 dark:text-neutral-0',
        description: 'text-sm/5 text-neutral-600 dark:text-neutral-300',
        icon: 'mt-0.5 size-4 shrink-0',
        actions: 'gap-2',
        close: 'size-7 justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
      },
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
