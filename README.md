
Architecture
Plan, diagram, and continuously refine your cloud architecture as the project evolves. Make deliberate decisions about where to use containers and where to use managed services. The architecture must reflect your problem definition.

Find a suitable cloud provider and justify, why you think it is best suited.

Document your results in an ## Architecture section in the README.md.

Infrastructure as Code
Use an Infrastructure-as-Code tool to manage the entire infrastructure. The setup must be easy and reliable to deploy, update, and tear down.

Document your setup in a ## Infrastructure as Code section in the README.md.

Security
Follow the cloud security best practices, such as the least-privilege principle and zero trust.

Use a cloud identity provider to signup and sign in users. Implement users with different roles. Make sure users are only authorized to perform allowed actions.

Document your users, roles and policies in a ## Security section in the README.md.

Monitoring & Observability
Implement monitoring, logging, and/or alerting for your system. You should be able to observe the health and behavior of your services, identify issues, and understand what is happening across your distributed components.

Document your monitoring and alerts in a ## Monitoring section in the README.md.

User Interfaces & Experience
Implement multiple user interfaces that make sense for your application. At least, there should be interfaces for a “normal” user and an “admin” user. Decide for yourself how and where to host the interfaces.

Make sure to follow UX best practices, e.g. by implementing typical design frameworks. Make it pretty. Reduce friction and make it as simple as possible - otherwise nobody will use your system.

Document your decisions and add a few screenshots in a ## User Experience section in the README.md.

Scalability & Load Testing
Design a system that is elastic and adapts to varying load. To ensure the system works, conduct a load test and record how the system reacts including scaling actions and user experience (e.g. response times).

Document your results in a ## Scalability & Load Testing section in the README.md.

Pricing
Set up a calculation based on expected workloads for your idea. Add calculations for multiple scenarios. Start with the idle scenario: “How much does the platform cost when it is idle?”. Make assumptions for different workloads and calculate how the price changes and how it affects the price per user.

Document your scenarios in a ## Pricing section in the README.md.
