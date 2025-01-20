// ==UserScript==
// @name         Enhanced Jira Sprint Report Metrics
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Scrape all Jira ticket numbers from a Jira sprint report page
// @author       Paresh Suthar
// @match        https://*.atlassian.net/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let scrapeButton = null;
    const baseUrl = 'https://[insert your Jira instance url here]'; // Jira instance URL like 'https://xxxxxxxx.atlassian.net'
    const sprintFieldKey = 'customfield_10007'; // Adjust this key based on your instance
    const allowedTypes = ['Story', 'Task', 'Bug']; // Allowed ticket types

    async function isUserLoggedIntoJira() {
        const apiUrl = `${baseUrl}/rest/auth/latest/session`;

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            });

            return response.ok; // Return true if logged in
        } catch (error) {
            console.error('Error checking Jira login status:', error);
            return false;
        }
    }

    async function getTicketDetails(ticketId) {
        const apiUrl = `${baseUrl}/rest/api/2/issue/${ticketId}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            });

            if (!response.ok) {
                console.error(`Failed to fetch details for ${ticketId}: ${response.statusText}`);
                return null;
            }

            const data = await response.json();
            const sprintField = data.fields[sprintFieldKey] || [];
            return {
                ticketId,
                summary: data.fields.summary,
                issueType: data.fields.issuetype.name,
                sprints: sprintField.map(sprint => sprint.name)
            };
        } catch (error) {
            console.error(`Error fetching details for ${ticketId}:`, error);
            return null;
        }
    }

    async function extractTicketsByTable() {
        const originalText = scrapeButton.textContent;

        try {
            scrapeButton.disabled = true;

            const loggedIn = await isUserLoggedIntoJira();
            if (!loggedIn) {
                alert("User is not logged into Jira. Cannot proceed.");
                return;
            }

            console.log("User is logged in. Proceeding with ticket extraction...");

            const ticketRegex = /\b[A-Z0-9]+-[0-9]+\b/;
            const tableTickets = {};
            let totalTickets = 0;
            let totalTicketsAddedAfterSprintStart = 0;
            let ticketsInPreviousSprints = 0;

            const button = document.querySelector('#ghx-items-trigger');
            const sprintName = button ? button.textContent.trim() : 'Unknown Sprint';

            // Populate tableTickets
            document.querySelectorAll('table.aui[aria-label]').forEach(table => {
                const tableLabel = table.getAttribute('aria-label');
                tableTickets[tableLabel] = new Set();

                table.querySelectorAll('td.ghx-nowrap a').forEach(link => {
                    const ticketText = link.textContent.trim();
                    if (ticketText.match(ticketRegex)) {
                        const parentTd = link.closest('td');
                        const hasStar = parentTd && parentTd.textContent.trim().endsWith('*');

                        totalTickets++;
                        if (hasStar) {
                            totalTicketsAddedAfterSprintStart++;
                        }

                        tableTickets[tableLabel].add(ticketText);
                    }
                });
            });

            const totalTicketsCount = Object.values(tableTickets).reduce((sum, tickets) => sum + tickets.size, 0);
            let processedCount = 0;

            const ticketDetails = [];
            const allowedTypes = ['Story', 'Task', 'Bug']; // Allowed ticket types

            // Process tickets
            for (const [label, tickets] of Object.entries(tableTickets)) {
                for (const ticket of tickets) {
                    const ticketId = ticket.replace('*', '');
                    processedCount++;

                    // Update button text with progress
                    scrapeButton.textContent = `Processing: ${ticketId} (${processedCount}/${totalTicketsCount})`;

                    const details = await getTicketDetails(ticketId);
                    if (details && allowedTypes.includes(details.issueType)) {
                        ticketDetails.push({ label, ...details });

                        // Check if the ticket was in a previous sprint
                        if (details.sprints && details.sprints.some(sprint => sprint !== sprintName)) {
                            ticketsInPreviousSprints++;
                        }
                    } else {
                        console.log(`Excluding ticket ${ticketId} of type ${details?.issueType || 'Unknown'}`);
                    }
                }
            }

            // Recalculate totals based on allowed types
            const filteredTableTickets = {};
            for (const detail of ticketDetails) {
                if (!filteredTableTickets[detail.label]) {
                    filteredTableTickets[detail.label] = [];
                }
                filteredTableTickets[detail.label].push(detail);
            }

            const totalCompletedIssues = filteredTableTickets["Completed Issues"]?.length || 0;
            const totalNotCompletedIssues = filteredTableTickets["Issues Not Completed"]?.length || 0;
            const totalIssuesRemovedFromSprint = filteredTableTickets["Issues Removed From Sprint"]?.length || 0;

            // Show results in an alert
            const resultMessage = `
Results for Sprint: [${sprintName}]

Total Tickets: ${ticketDetails.length}
Completed Tickets: ${totalCompletedIssues}
Not Completed Tickets: ${totalNotCompletedIssues}
Tickets Added After Sprint Start: ${totalTicketsAddedAfterSprintStart}
Tickets Removed From Sprint After Sprint Start: ${totalIssuesRemovedFromSprint}
Tickets from Previous Sprints: ${ticketsInPreviousSprints}
`;

            console.log(resultMessage);
            alert(resultMessage);

        } finally {
            scrapeButton.disabled = false;
            scrapeButton.textContent = originalText;
        }
    }

    function isSprintReportPage(url) {
        return url.includes('reports') && url.includes('sprint-retrospective');
    }

    function addScrapeButton() {

        const url = window.location.href;
        if (!isSprintReportPage(url)) {
            console.log(`Not a Sprint Report page (${url}). Button will not be added.`);
            return;
        }
        scrapeButton = document.createElement('button');
        scrapeButton.innerText = 'Get Sprint Metrics';
        scrapeButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
            padding: 10px;
            background-color: #0073e6;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        scrapeButton.addEventListener('click', extractTicketsByTable);
        document.body.appendChild(scrapeButton);
    }

    window.addEventListener('load', addScrapeButton);
})();
