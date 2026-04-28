<script lang="ts">
    import type { Project, Version } from "$lib/modrinth.type";
    import { Card } from "m3-svelte";

    let { project, fetchedProjects, fetchedVersions }: { project: Project, fetchedProjects: Record<string, Project>, fetchedVersions: Record<string, Version> } = $props();
</script>

<Card variant="filled">
    <div class="mod-card">
        <div class="basic">
            <h2>{project.title}</h2>
            <p>{project.description}</p>
        </div>
        <img src={project.icon_url} alt={`${project.title} icon`} width="50" height="50" />
    </div>
</Card>

<style>
    .mod-card {
        display: flex;
        gap: .1rem;
        align-items: flex-start;
        justify-content: space-between;
    }

    .basic {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
</style>