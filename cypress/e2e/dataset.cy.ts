describe('Dataset details page', () => {
  it('loads an existing dataset', () => {
    cy.visit('/en');
    // Get the name of the first dataset in the list.
    cy.getBySel('dataset-card-name')
      .first()
      .then($cardName => {
        // Navigate to the first dataset details page.
        cy.getBySel('dataset-card').first().click();
        cy.location('pathname').should('include', '/en/dataset');
        // On the details page.
        cy.getBySel('page-title').then($detailsName => {
          expect($cardName.text()).equal($detailsName.text());
          cy.getBySel('no-dataset').should('not.exist');
        });
      });
  });

  it('shows an error message if no dataset can be found', () => {
    cy.visit('/en/dataset/anIdThatDoesNotExist');
    cy.getBySel('no-dataset').should('exist');
    cy.getBySel('dataset-name').should('not.exist');
  });
});
