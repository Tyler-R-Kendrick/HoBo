import { bindle } from "@hobo/bindles";
import { intent, trainable } from "@hobo/runtime";

@trainable
class Hello {
	@intent("Produce a simple hello-world greeting")
	greet(name?: string): string {
		return name?.trim() ? `Hello, ${name.trim()}!` : "Hello World!";
	}
}

export default bindle((b) => ({
	web: b.web(Hello),
}));
