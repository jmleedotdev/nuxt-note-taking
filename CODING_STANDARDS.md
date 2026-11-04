# Reviewer standards

Use these expectations as judgement calls: explain the concrete trade-off in the
change rather than treating them as blanket bans.

## Use the framework first

Prefer supported helpers and defaults from the installed framework version.
Require a demonstrated gap before adding custom code or a dependency: what does
the supported approach fail to provide for the current requirement?

## Keep feature responsibilities together

Keep related feature responsibilities together so a reader can follow the behavior
locally. Introduce layers, barrels, or generic utilities only when they serve a
current need, not an imagined future reuse.

## Make language useful

UI text should help someone understand the current state, take action, or recover
from a problem. Judge feedback by that purpose rather than requiring or forbidding
a particular kind of message. Comments should explain concrete behavior or
rationale in clear language, rather than merely restating the code.
